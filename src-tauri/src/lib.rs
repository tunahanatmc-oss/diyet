// Diyet desktop shell. All app logic lives in the web code (React + sql.js); data is stored in the
// WebView's IndexedDB inside the app's own data folder (%LOCALAPPDATA%\com.diyet.app on Windows).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Diyet başlatılamadı");
}
