// 寻迹助手桌面外壳。
//
// 职责与原 PowerShell 启动器一致：必要时初始化用户数据、拉起本机服务、
// 等待带 token 的地址，然后在原生窗口里加载。区别是全程在一个窗口内完成，
// 用户看到的是启动进度而不是空白，服务进程随窗口关闭一起结束。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod launcher;

use std::sync::{Arc, Mutex};
use tauri::Manager;

/// 后台服务句柄；窗口关闭或进程退出时据此收尾，避免留下孤儿进程。
pub struct ServiceHandle(pub Arc<Mutex<Option<launcher::Service>>>);

fn main() {
    let handle: Arc<Mutex<Option<launcher::Service>>> = Arc::new(Mutex::new(None));
    let for_setup = handle.clone();

    tauri::Builder::default()
        .manage(ServiceHandle(handle.clone()))
        .setup(move |app| {
            let window = app.get_webview_window("main").expect("缺少主窗口");
            let service_slot = for_setup.clone();
            // 启动编排放到后台线程：UI 线程要保持响应，才能显示进度
            std::thread::spawn(move || {
                let report = |text: &str| {
                    let _ = window.eval(&format!(
                        "window.__WORKBENCH__ && window.__WORKBENCH__.progress({})",
                        serde_json::to_string(text).unwrap_or_else(|_| "\"\"".into())
                    ));
                };
                match launcher::start(&report) {
                    Ok(service) => {
                        let url = service.url.clone();
                        *service_slot.lock().unwrap() = Some(service);
                        // 必须把地址作为新窗口的初始地址打开，不能在启动页里跳转：
                        // DSH 的会话 Cookie 是 SameSite=Strict，从 tauri://localhost 发起的
                        // 跳转算跨站，鉴权重定向后 Cookie 不会回传，页面会停在 401。
                        let app = window.app_handle().clone();
                        let runner = app.clone();
                        let _ = runner.run_on_main_thread(move || {
                            let opened = url.parse().ok().and_then(|parsed| {
                                tauri::WebviewWindowBuilder::new(
                                    &app,
                                    "app",
                                    tauri::WebviewUrl::External(parsed),
                                )
                                .title("寻迹助手")
                                .inner_size(1280.0, 860.0)
                                .min_inner_size(900.0, 600.0)
                                .center()
                                .build()
                                .ok()
                            });
                            if opened.is_some() {
                                if let Some(splash) = app.get_webview_window("main") {
                                    let _ = splash.close();
                                }
                            }
                        });
                    }
                    Err(error) => {
                        let _ = window.eval(&format!(
                            "window.__WORKBENCH__ && window.__WORKBENCH__.failed({})",
                            serde_json::to_string(&error).unwrap_or_else(|_| "\"\"".into())
                        ));
                    }
                }
            });
            Ok(())
        })
        .on_window_event(move |window, event| {
            // 启动页关闭属于正常交接，只有主窗口关闭才收尾服务
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "app" {
                if let Some(state) = window.app_handle().try_state::<ServiceHandle>() {
                    if let Some(service) = state.0.lock().unwrap().take() {
                        service.stop();
                    }
                }
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("外壳启动失败");
}
