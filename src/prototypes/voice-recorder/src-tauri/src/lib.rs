// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            #[cfg(target_os = "linux")]
            allow_microphone(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// WebKitGTK keeps media capture off and nobody answers its permission request,
// so getUserMedia fails with NotAllowedError. Turn it on and allow mic requests only.
#[cfg(target_os = "linux")]
fn allow_microphone(app: &tauri::App) -> tauri::Result<()> {
    use tauri::Manager;
    use webkit2gtk::glib::prelude::ObjectExt;
    use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, WebViewExt};

    let window = app.get_webview_window("main").expect("main window");
    window.with_webview(|webview| {
        let view = webview.inner();
        if let Some(settings) = view.settings() {
            settings.set_enable_media_stream(true);
        }
        view.connect_permission_request(|_, request| {
            if request.is::<UserMediaPermissionRequest>() {
                request.allow();
                return true;
            }
            false
        });
    })
}
