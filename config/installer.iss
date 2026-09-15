; 寻迹助手安装包。由 scripts/package-installer.mjs 调用 ISCC 编译。
; 程序装到用户选定目录；用户数据固定在 %LOCALAPPDATA%\寻迹助手，卸载与升级都不动。

#define AppName "寻迹助手"
#define AppExe "寻迹助手.exe"
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\app"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{9C6DE5C5-B712-42AE-BA19-755E06AA5C76}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
; 安装包与卸载程序沿用外壳 exe 内嵌的同一图标，保持一致
SetupIconFile={#SourcePath}\..\shell\icons\icon.ico
; 默认装到用户目录：无需管理员、无 UAC 弹窗，安装明显更快；用户仍可在向导里改路径
DefaultDirName={localappdata}\Programs\{#AppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; 允许用户改安装位置
DisableDirPage=no
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename={#AppName}-{#AppVersion}-安装
; 依赖有两万多个小文件，固实+极限压缩会让解压变成单线程长任务。
; 这里换成分块压缩并开多线程，包体略大但安装时间从十分钟级降到分钟级。
Compression=lzma2/normal
SolidCompression=no
LZMANumBlockThreads=4
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}

[Languages]
Name: "chinese"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{group}\卸载 {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "立即启动 {#AppName}"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
; 只清理程序目录下运行期生成的文件；用户数据在 %LOCALAPPDATA% 不删
Type: filesandordirs; Name: "{app}\app\node_modules\.cache"

[Messages]
chinese.WelcomeLabel2=即将安装 {#AppName} {#AppVersion}。%n%n配置、会话与已导入的对话保存在你的用户目录，升级或重装都不会丢失。
