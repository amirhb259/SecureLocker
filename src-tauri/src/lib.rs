use serde::Serialize;
use std::{
    fs::{create_dir_all, File, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;

const API_HOST: &str = "127.0.0.1";
const API_PORT: u16 = 4100;

#[derive(Default)]
struct BackendState {
    child: Mutex<Option<Child>>,
    last_error: Mutex<Option<String>>,
}

impl Drop for BackendState {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut process) = child.take() {
                let _ = process.kill();
                let _ = process.wait();
            }
        }
    }
}

#[derive(Serialize)]
struct BackendStatus {
    healthy: bool,
    url: String,
    error: Option<String>,
}

#[tauri::command]
fn backend_status(state: tauri::State<'_, BackendState>) -> BackendStatus {
    BackendStatus {
        healthy: api_health_ok(),
        url: api_base_url(),
        error: state.last_error.lock().ok().and_then(|error| error.clone()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![backend_status])
        .setup(|app| {
            let state = app.state::<BackendState>();
            if let Err(error) = ensure_backend_started(app.handle(), &state) {
                if let Ok(mut last_error) = state.last_error.lock() {
                    *last_error = Some(error.clone());
                }
                return Err(error.into());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn ensure_backend_started(app: &tauri::AppHandle, state: &BackendState) -> Result<(), String> {
    if api_health_ok() {
        return Ok(());
    }

    let backend_dir = resolve_backend_dir(app)?;
    let node_path = backend_dir.join("node.exe");
    let server_path = backend_dir.join("server").join("index.js");

    if !node_path.exists() {
        return Err(format!(
            "SecureLocker backend runtime is missing: {}",
            node_path.display()
        ));
    }

    if !server_path.exists() {
        return Err(format!(
            "SecureLocker backend entrypoint is missing: {}",
            server_path.display()
        ));
    }

    let log_dir = backend_log_dir(app);
    let stdout = open_log_file(&log_dir, "backend.out.log")?;
    let stderr = open_log_file(&log_dir, "backend.err.log")?;

    let mut command = Command::new(&node_path);
    command
        .arg(&server_path)
        .current_dir(&backend_dir)
        .env("NODE_ENV", "production")
        .env("PORT", API_PORT.to_string())
        .env("API_BASE_URL", format!("http://{}:{}", API_HOST, API_PORT))
        .env("FRONTEND_URL", "http://tauri.localhost")
        .env(
            "CORS_ORIGIN",
            "http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost",
        )
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let child = command.spawn().map_err(|error| {
        format!(
            "SecureLocker backend failed to start from {}: {}",
            backend_dir.display(),
            error
        )
    })?;

    if let Ok(mut stored_child) = state.child.lock() {
        *stored_child = Some(child);
    }

    wait_for_backend_health(state, log_dir)
}

fn wait_for_backend_health(state: &BackendState, log_dir: PathBuf) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(20);

    while Instant::now() < deadline {
        if api_health_ok() {
            return Ok(());
        }

        if let Ok(mut child_guard) = state.child.lock() {
            if let Some(child) = child_guard.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(format!(
                        "SecureLocker backend exited before becoming healthy with status {}. Logs: {}",
                        status,
                        log_dir.display()
                    ));
                }
            }
        }

        std::thread::sleep(Duration::from_millis(250));
    }

    Err(format!(
        "SecureLocker backend did not pass health check at {} within 20 seconds. Logs: {}",
        api_base_url(),
        log_dir.display()
    ))
}

fn resolve_backend_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("backend"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("resources").join("backend"));
        candidates.push(current_dir.join("src-tauri").join("resources").join("backend"));
    }

    candidates
        .into_iter()
        .find(|path| path.join("server").join("index.js").exists())
        .ok_or_else(|| "SecureLocker backend resources were not found in the application bundle.".to_string())
}

fn backend_log_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("SecureLocker"));

    let _ = create_dir_all(&dir);
    dir
}

fn open_log_file(log_dir: &PathBuf, name: &str) -> Result<File, String> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join(name))
        .map_err(|error| format!("Could not open backend log file {}: {}", log_dir.join(name).display(), error))
}

fn api_base_url() -> String {
    format!("http://{}:{}/api", API_HOST, API_PORT)
}

fn api_health_ok() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], API_PORT));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));

    if stream
        .write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("\"ok\":true")
}
