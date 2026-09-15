// 启动编排：定位程序与数据目录、必要时初始化、拉起服务、等待带 token 的地址。
//
// 这些步骤原先由 launch-app.ps1 承担，移到外壳里是为了把进度显示在窗口内，
// 并让服务进程的生命周期跟随窗口。

use std::fs;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// 不为子进程弹出控制台窗口。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const PORT_CANDIDATES: [u16; 5] = [3080, 3090, 3100, 3110, 3120];

/// 把服务进程放进作业对象：外壳正常退出会主动收尾，若被任务管理器强杀，
/// 作业对象保证子进程树同时终止，不会留下占着端口的孤儿。
#[cfg(windows)]
mod job {
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
        JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    struct Job(HANDLE);
    // 句柄仅在本进程内使用，跨线程共享是安全的
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    static JOB: OnceLock<Option<Job>> = OnceLock::new();

    fn handle() -> Option<HANDLE> {
        JOB.get_or_init(|| unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                return None;
            }
            Some(Job(job))
        })
        .as_ref()
        .map(|job| job.0)
    }

    /// 失败不影响启动：仅意味着退化回显式收尾。
    pub fn adopt(pid: u32) {
        let Some(job) = handle() else { return };
        unsafe {
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                return;
            }
            AssignProcessToJobObject(job, process);
        }
    }
}
const SERVICE_TIMEOUT: Duration = Duration::from_secs(180);
const URL_TIMEOUT: Duration = Duration::from_secs(90);

pub struct Service {
    pub url: String,
    child: Child,
}

impl Service {
    /// 结束服务及其子进程。DSH 会派生 node 与各资料源进程，
    /// 只杀直接子进程会留下孤儿，因此在 Windows 上用 taskkill 整棵树结束。
    pub fn stop(mut self) {
        #[cfg(windows)]
        {
            let mut killer = Command::new("taskkill");
            killer
                .args(["/PID", &self.child.id().to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            killer.creation_flags(CREATE_NO_WINDOW);
            let _ = killer.status();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// 程序根目录：可执行文件所在目录。打包后结构为 `<root>/app` 与 `<root>/runtime`。
fn app_root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| format!("无法定位程序位置：{error}"))?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法定位程序目录".to_string())
}

/// 用户数据目录，与程序目录分离，升级覆盖不受影响。
fn data_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("APPDATA"))
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法定位用户目录".to_string())?;
    Ok(PathBuf::from(base).join("寻迹助手"))
}

/// 内置运行时优先；缺失时退回系统 node，便于开发期直接跑。
fn node_executable(root: &Path) -> PathBuf {
    let bundled = root.join("runtime").join("node.exe");
    if bundled.exists() {
        bundled
    } else {
        PathBuf::from("node")
    }
}

fn program_dir(root: &Path) -> PathBuf {
    let packaged = root.join("app");
    if packaged.join("scripts").join("start.mjs").exists() {
        packaged
    } else {
        // 开发期：外壳在 shell/target/... 下运行，程序目录是仓库根
        root.to_path_buf()
    }
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into(),
        Duration::from_millis(250),
    )
    .is_ok()
}

/// 从启动日志里取出带 token 的地址；DSH 要等全部资料源就绪后才打印。
///
/// 只接受已换行的完整行：轮询可能撞上日志正在写入的瞬间，
/// 截断的 token 会让页面直接 401。
fn find_url(logs: &[PathBuf], port: u16) -> Option<String> {
    let needle = format!("http://127.0.0.1:{port}/?token=");
    for log in logs {
        let Ok(text) = fs::read_to_string(log) else { continue };
        for line in text.lines() {
            // lines() 会把末尾未换行的残行也算作一行，因此额外确认该行确实以换行结束
            let Some(start) = line.find(&needle) else { continue };
            let candidate = line[start..].trim_end();
            if candidate.len() <= needle.len() {
                continue;
            }
            let line_end = text.find(line).map(|at| at + line.len()).unwrap_or(0);
            if text[line_end..].starts_with('\n') || text[line_end..].starts_with('\r') {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

fn spawn_node(
    node: &Path,
    program: &Path,
    args: &[&str],
    out_log: &Path,
    err_log: &Path,
) -> Result<Child, String> {
    let stdout = fs::File::create(out_log).map_err(|error| format!("无法写日志：{error}"))?;
    let stderr = fs::File::create(err_log).map_err(|error| format!("无法写日志：{error}"))?;
    let mut command = Command::new(node);
    command
        .args(args)
        .current_dir(program)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .stdin(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let child = command.spawn().map_err(|error| match error.kind() {
        ErrorKind::NotFound => "找不到运行时，请重新安装本程序。".to_string(),
        _ => format!("无法启动服务：{error}"),
    })?;
    #[cfg(windows)]
    job::adopt(child.id());
    Ok(child)
}

fn tail(path: &Path, lines: usize) -> String {
    let Ok(text) = fs::read_to_string(path) else { return String::new() };
    let collected: Vec<&str> = text.lines().rev().take(lines).collect();
    collected.into_iter().rev().collect::<Vec<_>>().join("\n")
}

/// Profile 内的插件是绝对路径链接，换版本或换安装位置后都必须重新初始化。
fn needs_setup(data: &Path, program: &Path) -> bool {
    let marker = data.join(".dsh").join("xunji-dsh-version");
    let Ok(text) = fs::read_to_string(marker) else { return true };
    let Ok(config) = fs::read_to_string(program.join("config").join("versions.json")) else { return true };
    let Ok(versions) = serde_json::from_str::<serde_json::Value>(&config) else { return true };
    let Some(expected) = versions["dsh"]["version"].as_str() else { return true };
    if text.lines().next().map(str::trim) != Some(expected) {
        return true;
    }
    if !data.join(".dsh").join("profiles").join("web").join("node_modules").exists() {
        return true;
    }
    match text.lines().nth(1) {
        Some(recorded) => recorded.trim() != program.to_string_lossy(),
        None => true,
    }
}

pub fn start(report: &dyn Fn(&str)) -> Result<Service, String> {
    let root = app_root()?;
    let program = program_dir(&root);
    let node = node_executable(&root);
    let data = data_dir()?;
    let logs = data.join("logs");
    fs::create_dir_all(&logs).map_err(|error| format!("无法创建数据目录：{error}"))?;

    let stamp = format!("{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default());

    if needs_setup(&data, &program) {
        report("首次启动，正在初始化，大约需要一分钟…");
        let setup_script = program.join("scripts").join("setup.mjs");
        // 安装刚落盘时杀毒软件仍在扫描新文件，初始化会偶发读取失败（UNKNOWN: unknown error, open …），
        // 同样的步骤几秒后再跑就能成功，因此失败后间隔几秒自动重试一次，不把这种抖动直接抛给用户。
        let mut failure = None;
        for attempt in 1..=2 {
            if attempt > 1 {
                report("初始化未完成，正在重试…");
                std::thread::sleep(Duration::from_secs(5));
            }
            let out_log = logs.join(format!("setup-{stamp}-{attempt}.out.log"));
            let err_log = logs.join(format!("setup-{stamp}-{attempt}.err.log"));
            let mut child = spawn_node(
                &node,
                &program,
                &[&setup_script.to_string_lossy()],
                &out_log,
                &err_log,
            )?;
            let status = child
                .wait()
                .map_err(|error| format!("初始化中断：{error}"))?;
            if status.success() {
                failure = None;
                break;
            }
            // 真实原因通常在 pnpm 的标准输出里，错误日志只有一行“pnpm failed”
            failure = Some(format!(
                "初始化失败。\n日志：{}\n{}\n\n{}\n{}\n\n可关闭窗口后重新打开再试一次；仍失败请把上述日志发给维护者。",
                err_log.display(),
                out_log.display(),
                tail(&out_log, 6),
                tail(&err_log, 6)
            ));
        }
        if let Some(message) = failure {
            return Err(message);
        }
    }

    report("正在启动本机服务…");
    let port = PORT_CANDIDATES
        .into_iter()
        .find(|candidate| !port_open(*candidate) && !port_open(candidate + 1))
        .ok_or("没有可用端口，请关闭已在运行的实例后重试。")?;

    let out_log = logs.join(format!("start-{stamp}.out.log"));
    let err_log = logs.join(format!("start-{stamp}.err.log"));
    let start_script = program.join("scripts").join("start.mjs");
    let port_text = port.to_string();
    let mut child = spawn_node(
        &node,
        &program,
        &[
            &start_script.to_string_lossy(),
            "--no-open",
            "--port",
            &port_text,
        ],
        &out_log,
        &err_log,
    )?;

    let log_paths = vec![out_log.clone(), err_log.clone()];
    let deadline = Instant::now() + SERVICE_TIMEOUT;
    while Instant::now() < deadline {
        if port_open(port) {
            report("正在载入资料源…");
            let url_deadline = Instant::now() + URL_TIMEOUT;
            loop {
                if let Some(url) = find_url(&log_paths, port) {
                    return Ok(Service { url, child });
                }
                if matches!(child.try_wait(), Ok(Some(_))) || Instant::now() >= url_deadline {
                    break;
                }
                std::thread::sleep(Duration::from_millis(400));
            }
            break;
        }
        if matches!(child.try_wait(), Ok(Some(_))) {
            break;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    let details = tail(&err_log, 12);
    let _ = child.kill();
    let _ = child.wait();
    Err(format!(
        "启动失败。\n日志：{}\n\n{}",
        err_log.display(),
        details
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_checks_version_path_and_profile() {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("xunji-shell-test-{}-{stamp}", std::process::id()));
        let program = root.join("app");
        let data = root.join("data");
        fs::create_dir_all(program.join("config")).unwrap();
        let modules = data.join(".dsh").join("profiles").join("web").join("node_modules");
        fs::create_dir_all(&modules).unwrap();
        fs::write(program.join("config").join("versions.json"), r#"{"dsh":{"version":"0.1.5-rc.2"}}"#).unwrap();
        let marker = data.join(".dsh").join("xunji-dsh-version");
        assert!(needs_setup(&data, &program));
        fs::write(&marker, format!("0.1.5-rc.1\n{}\n", program.display())).unwrap();
        assert!(needs_setup(&data, &program), "同目录升级仍须初始化");
        fs::write(&marker, "0.1.5-rc.2\nold-path\n").unwrap();
        assert!(needs_setup(&data, &program), "移动程序后须初始化");
        fs::write(&marker, format!("0.1.5-rc.2\n{}\n", program.display())).unwrap();
        assert!(!needs_setup(&data, &program));
        fs::remove_dir(&modules).unwrap();
        assert!(needs_setup(&data, &program), "缺少 Profile 依赖须重新初始化");
        fs::remove_dir_all(root).unwrap();
    }
}
