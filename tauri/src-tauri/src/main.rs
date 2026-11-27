// Skyvaint Game Launcher, Tauri shell (phase 1).
//
// The page in ../../wwwroot is the same one the WinForms launcher shows. It talks to this shell the same way:
// the page calls the `msg` command with {type, ...}, and the shell answers with a `host` event.
//
// Data folder: --data <folder> for a throw-away test run. Otherwise %APPDATA%\SkyvaintLauncherNext, which on its
// first start takes a copy of the WinForms launcher's config.json and state.json. The WinForms launcher's own
// files are only ever read, never written, so both launchers can be used side by side while this one grows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
mod leds;
mod scan;

use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const MEDIA_OLD: &str = "https://media.skyvaint.example/";
const PAGE_OLD: &str = "https://skyvaint.example/";
#[cfg(windows)]
const MEDIA_NEW: &str = "http://media.localhost/";
#[cfg(not(windows))]
const MEDIA_NEW: &str = "media://localhost/";
#[cfg(windows)]
const PAGE_NEW: &str = "http://tauri.localhost/";
#[cfg(not(windows))]
const PAGE_NEW: &str = "tauri://localhost/";

struct Shell {
    data: PathBuf,
    /// The WinForms launcher's folder: read only, for the first copy and for pictures not copied yet.
    legacy: Option<PathBuf>,
    fresh: bool,
    config: Mutex<Value>,
    state: Mutex<Value>,
    running: Mutex<HashSet<String>>,
    launched: Mutex<HashSet<String>>,
    mode: Mutex<String>,
    mini: Mutex<(f64, f64)>,
    dirty: AtomicBool,
    launching: AtomicBool,
    skip: AtomicBool,
}

fn app_data() -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        Path::new(&home).join(".config")
    }
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

/// Writes to a side file first, so a crash halfway never leaves a cut-off config.
fn write_json(path: &Path, v: &Value) {
    let tmp = path.with_extension("json.tmp");
    if let Ok(text) = serde_json::to_string_pretty(v) {
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(&tmp, path);
        }
    }
}

fn to_page(v: &Value) -> Value {
    let text = v.to_string().replace(MEDIA_OLD, MEDIA_NEW).replace(PAGE_OLD, PAGE_NEW);
    serde_json::from_str(&text).unwrap_or_else(|_| v.clone())
}
fn from_page(v: &Value) -> Value {
    let text = v.to_string().replace(MEDIA_NEW, MEDIA_OLD).replace(PAGE_NEW, PAGE_OLD);
    serde_json::from_str(&text).unwrap_or_else(|_| v.clone())
}

impl Shell {
    fn open() -> Shell {
        let args: Vec<String> = std::env::args().collect();
        let test = args.iter().position(|a| a == "--data").and_then(|i| args.get(i + 1)).map(PathBuf::from);
        let legacy_dir = app_data().join("SkyvaintGameLauncher");
        let legacy = (test.is_none() && legacy_dir.is_dir()).then_some(legacy_dir);
        let data = test.unwrap_or_else(|| app_data().join("SkyvaintLauncherNext"));
        let _ = fs::create_dir_all(data.join("media"));
        let config_path = data.join("config.json");
        let state_path = data.join("state.json");
        if !config_path.exists() {
            if let Some(old) = &legacy {
                for name in ["config.json", "state.json"] {
                    let _ = fs::copy(old.join(name), data.join(name));
                }
            }
        }
        let config = read_json(&config_path);
        let fresh = config.is_none();
        Shell {
            legacy,
            fresh,
            config: Mutex::new(config.unwrap_or(Value::Null)),
            state: Mutex::new(read_json(&state_path).unwrap_or_else(|| json!({}))),
            data,
            running: Mutex::new(HashSet::new()),
            launched: Mutex::new(HashSet::new()),
            mode: Mutex::new("home".into()),
            mini: Mutex::new((420.0, 640.0)),
            dirty: AtomicBool::new(false),
            launching: AtomicBool::new(false),
            skip: AtomicBool::new(false),
        }
    }

    fn behavior(&self, key: &str, fallback: &str) -> String {
        self.config.lock().unwrap()["behavior"][key].as_str().unwrap_or(fallback).to_string()
    }

    fn stats(&self) -> Value {
        let mut st = self.state.lock().unwrap();
        if !st["stats"].is_object() {
            st["stats"] = json!({});
        }
        st["stats"].clone()
    }

    fn save_state(&self) {
        let st = self.state.lock().unwrap();
        write_json(&self.data.join("state.json"), &st);
        self.dirty.store(false, Ordering::Relaxed);
    }

    fn game(&self, id: &str) -> Option<Value> {
        let cfg = self.config.lock().unwrap();
        cfg["games"].as_array()?.iter().find(|g| g["id"] == id).cloned()
    }

    /// Every game's process names (without .exe, lower case), for the running check.
    fn wanted(&self) -> Vec<(String, Vec<String>)> {
        let cfg = self.config.lock().unwrap();
        let Some(games) = cfg["games"].as_array() else { return vec![] };
        games
            .iter()
            .filter_map(|g| {
                let procs: Vec<String> = g["process"]
                    .as_str()
                    .unwrap_or_default()
                    .split(',')
                    .map(|p| p.trim().trim_end_matches(".exe").trim_end_matches(".EXE").to_lowercase())
                    .filter(|p| !p.is_empty())
                    .collect();
                (!procs.is_empty()).then(|| (g["id"].as_str().unwrap_or_default().to_string(), procs))
            })
            .collect()
    }
}

fn send(app: &AppHandle, msg: Value) {
    let _ = app.emit_to("main", "host", to_page(&msg));
}

/// The file behind a picture link (media.skyvaint.example/…), in this launcher's media folder or the old one's.
fn media_file(app: &AppHandle, url: &str) -> Option<PathBuf> {
    let name = url.rsplit('/').next()?.split('?').next()?;
    if name.is_empty() || name.contains("..") {
        return None;
    }
    let shell = app.state::<Shell>();
    std::iter::once(shell.data.join("media")).chain(shell.legacy.iter().map(|l| l.join("media"))).map(|d| d.join(name)).find(|p| p.is_file())
}

/// A file dialog (on its own thread, so the window keeps drawing). Pictures, videos, sounds and fonts are copied
/// into the media folder and come back as a link; programs, game files and folders come back as a path.
fn pick_file(app: AppHandle, kind: String, token: String) {
    std::thread::spawn(move || {
        let mut reply = json!({ "type": "filePicked", "token": token });
        let filters: (&str, &[&str]) = match kind.as_str() {
            "image" => ("Images", &["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "ico"]),
            "media" => ("Pictures, GIFs and videos", &["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "ico", "mp4", "webm", "m4v", "mov"]),
            "video" => ("Videos", &["mp4", "webm", "m4v", "mov"]),
            "audio" => ("Audio", &["mp3", "wav", "ogg", "m4a", "flac"]),
            "font" => ("Fonts", &["ttf", "otf", "woff", "woff2"]),
            "iso" => ("Games, mods and archives", &["iso", "chd", "cso", "zso", "bin", "gz", "rvz", "wbfs", "zip", "7z", "rar"]),
            _ => ("Games and shortcuts", &["exe", "lnk", "url", "bat"]),
        };
        let dialog = rfd::FileDialog::new();
        if kind == "folder" {
            if let Some(dir) = dialog.set_title("Choose a folder").pick_folder() {
                reply["path"] = json!(dir.to_string_lossy());
            }
            return send(&app, reply);
        }
        let Some(path) = dialog.add_filter(filters.0, filters.1).add_filter("All files", &["*"]).pick_file() else { return send(&app, reply) };
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        reply["name"] = json!(name);
        reply["path"] = json!(path.to_string_lossy());
        if kind == "exe" || kind == "iso" {
            let stem = path.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            reply["title"] = json!(stem);
            let is_exe = name.to_lowercase().ends_with(".exe");
            reply["process"] = json!(if is_exe { stem } else { String::new() });
            reply["paths"] = json!([path.to_string_lossy()]);
            return send(&app, reply);
        }
        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let file = format!("media_{stamp:x}.{ext}");
        let dest = app.state::<Shell>().data.join("media").join(&file);
        match fs::copy(&path, &dest) {
            Ok(_) => reply["url"] = json!(format!("{MEDIA_OLD}{file}")),
            Err(e) => reply["error"] = json!(e.to_string()),
        }
        send(&app, reply);
    });
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn set_mode(app: &AppHandle, mode: &str, notify: bool) {
    let shell = app.state::<Shell>();
    *shell.mode.lock().unwrap() = mode.to_string();
    if let Some(w) = window(app) {
        match mode {
            "hidden" => {
                let _ = w.hide();
            }
            "mini" => {
                let (mw, mh) = *shell.mini.lock().unwrap();
                let _ = w.set_fullscreen(false);
                let _ = w.set_size(tauri::LogicalSize::new(mw, mh));
                if let Ok(Some(mon)) = w.current_monitor() {
                    let scale = mon.scale_factor();
                    let size = mon.size().to_logical::<f64>(scale);
                    let pos = mon.position().to_logical::<f64>(scale);
                    let _ = w.set_position(tauri::LogicalPosition::new(pos.x + size.width - mw - 24.0, pos.y + size.height - mh - 64.0));
                }
                let _ = w.set_always_on_top(shell.config.lock().unwrap()["behavior"]["miniOnTop"].as_bool().unwrap_or(true));
                let _ = w.show();
                let _ = w.set_focus();
            }
            _ => {
                let _ = w.set_always_on_top(false);
                let _ = w.set_fullscreen(true);
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
    if notify {
        send(app, json!({ "type": "mode", "mode": mode }));
    }
}

/// Starts a program or link on its own, the way Explorer would, so closing the launcher never closes it.
fn start_detached(target: &str, args: &str) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED: u32 = 0x0000_0008;
        const BREAKAWAY: u32 = 0x0100_0000;
        let mut cmd = std::process::Command::new("cmd");
        let dir = Path::new(target).parent().filter(|_| Path::new(target).is_file());
        // `start` hands the target to the shell: .exe, .lnk, URLs and store app links all work.
        cmd.raw_arg(format!("/C start \"\" \"{}\" {}", target.replace('"', ""), args));
        if let Some(d) = dir {
            cmd.current_dir(d);
        }
        cmd.creation_flags(CREATE_NO_WINDOW | DETACHED | BREAKAWAY);
        cmd.spawn().or_else(|_| {
            let mut again = std::process::Command::new("cmd");
            again.raw_arg(format!("/C start \"\" \"{}\" {}", target.replace('"', ""), args));
            again.creation_flags(CREATE_NO_WINDOW | DETACHED);
            again.spawn()
        })?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(target).spawn()?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(target).spawn()?;
        Ok(())
    }
}

fn live_processes() -> HashSet<String> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes()
        .values()
        .map(|p| p.name().to_string_lossy().trim_end_matches(".exe").trim_end_matches(".EXE").to_lowercase())
        .collect()
}

fn launch(app: AppHandle, id: String) {
    let shell = app.state::<Shell>();
    if shell.launching.swap(true, Ordering::SeqCst) {
        return;
    }
    shell.skip.store(false, Ordering::SeqCst);
    let done = |app: &AppHandle| app.state::<Shell>().launching.store(false, Ordering::SeqCst);
    let Some(game) = shell.game(&id) else {
        send(&app, json!({ "type": "launchFailed", "id": id, "error": "That game isn't in the list any more." }));
        return done(&app);
    };
    let name = game["name"].as_str().unwrap_or("the game").to_string();
    let target = game["target"].as_str().unwrap_or_default().trim().to_string();
    if target.is_empty() {
        send(&app, json!({ "type": "launchFailed", "id": id, "error": "This game has no launch target set." }));
        return done(&app);
    }
    send(&app, json!({ "type": "launchStep", "text": format!("Starting {name}") }));
    let started = if let Some(which) = target.strip_prefix("sv:") {
        let protocol = if which == "roblox" { "roblox-player" } else { "roblox-studio" };
        match scan::protocol_command(protocol) {
            Some((exe, args)) => start_detached(&exe, &args).map_err(|e| e.to_string()),
            None => Err(format!("{name} doesn't look installed.")),
        }
    } else {
        start_detached(&target, game["args"].as_str().unwrap_or_default()).map_err(|e| e.to_string())
    };
    if let Err(e) = started {
        send(&app, json!({ "type": "launchFailed", "id": id, "error": format!("Couldn't start {name}: {e}") }));
        return done(&app);
    }
    shell.launched.lock().unwrap().insert(id.clone());
    app.state::<leds::Leds>().flash();
    let procs: Vec<String> = shell.wanted().into_iter().find(|(g, _)| *g == id).map(|(_, p)| p).unwrap_or_default();
    let limit = 120u64;
    if !procs.is_empty() {
        send(&app, json!({ "type": "launchWaiting", "seconds": limit }));
        let until = Instant::now() + Duration::from_secs(limit);
        while Instant::now() < until && !shell.skip.load(Ordering::SeqCst) {
            if procs.iter().any(|p| live_processes().contains(p)) {
                break;
            }
            std::thread::sleep(Duration::from_millis(800));
        }
    } else {
        std::thread::sleep(Duration::from_millis(1500));
    }
    send(&app, json!({ "type": "launchReady" }));
    std::thread::sleep(Duration::from_millis(900));
    if shell.behavior("afterLaunch", "hidden") != "home" {
        let after = shell.behavior("afterLaunch", "hidden");
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || set_mode(&handle, if after == "mini" { "mini" } else { "hidden" }, true));
    }
    done(&app);
}

/// Every 3 seconds: which games are running, and their play time.
fn poll(app: AppHandle) {
    let mut last_save = Instant::now();
    loop {
        std::thread::sleep(Duration::from_secs(3));
        let shell = app.state::<Shell>();
        let wanted = shell.wanted();
        let was = shell.running.lock().unwrap().clone();
        if wanted.is_empty() && was.is_empty() {
            continue;
        }
        let live = live_processes();
        let now: HashSet<String> = wanted.iter().filter(|(_, p)| p.iter().any(|n| live.contains(n))).map(|(g, _)| g.clone()).collect();
        if !now.is_empty() {
            let mut st = shell.state.lock().unwrap();
            if !st["stats"].is_object() {
                st["stats"] = json!({});
            }
            for id in &now {
                let s = &mut st["stats"][id];
                if !s.is_object() {
                    *s = json!({});
                }
                s["seconds"] = json!(s["seconds"].as_i64().unwrap_or(0) + 3);
            }
            drop(st);
            shell.dirty.store(true, Ordering::Relaxed);
        }
        if now == was {
            if !now.is_empty() && last_save.elapsed() > Duration::from_secs(60) {
                shell.save_state();
                last_save = Instant::now();
                send(&app, json!({ "type": "stats", "stats": shell.stats() }));
            }
            continue;
        }
        let ended: Vec<String> = was.difference(&now).cloned().collect();
        *shell.running.lock().unwrap() = now.clone();
        app.state::<leds::Leds>().playing.store(!now.is_empty(), Ordering::Relaxed);
        shell.save_state();
        last_save = Instant::now();
        send(&app, json!({ "type": "running", "ids": now.iter().collect::<Vec<_>>(), "stats": shell.stats() }));
        let ours = {
            let mut l = shell.launched.lock().unwrap();
            let any = ended.iter().any(|g| l.contains(g));
            for g in &ended {
                l.remove(g);
            }
            any
        };
        let mode = shell.mode.lock().unwrap().clone();
        if ours && now.is_empty() && mode != "home" && shell.behavior("onGameExit", "home") == "home" {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || set_mode(&handle, "home", true));
        }
    }
}

#[tauri::command]
async fn msg(app: AppHandle, m: Value) {
    if desktop::on_message(&app, &m) || leds::on_message(&app, &m) {
        return;
    }
    let shell = app.state::<Shell>();
    let kind = m["type"].as_str().unwrap_or_default().to_string();
    match kind.as_str() {
        "ready" => {
            let config = shell.config.lock().unwrap().clone();
            let mode = shell.mode.lock().unwrap().clone();
            send(
                &app,
                json!({
                    "type": "init",
                    "config": if config.is_null() { Value::Null } else { config },
                    "fresh": shell.fresh,
                    "wake": false,
                    "stats": shell.stats(),
                    "scan": scan::scan(),
                    "mode": mode,
                    "autostart": false,
                    "epic": Value::Null,
                    "steam": Value::Null,
                    "robloxImport": Value::Null,
                    "safeGraphics": false,
                    "shell": "tauri",
                }),
            );
            set_mode(&app, &mode, false);
            let cfg = shell.config.lock().unwrap().clone();
            desktop::sync(&app, &cfg);
        }
        "saveImage" => {
            // A picture made in the creator: a PNG from the page, kept in the media folder.
            use base64::Engine;
            let mut reply = json!({ "type": "imageSaved", "token": m["token"] });
            let data = m["dataUrl"].as_str().unwrap_or_default();
            match data.strip_prefix("data:image/png;base64,").map(|b| base64::engine::general_purpose::STANDARD.decode(b)) {
                Some(Ok(bytes)) if bytes.len() < 20_000_000 => {
                    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
                    let name = format!("made_{stamp:x}.png");
                    match fs::write(shell.data.join("media").join(&name), bytes) {
                        Ok(_) => reply["url"] = json!(format!("{MEDIA_OLD}{name}")),
                        Err(e) => reply["error"] = json!(e.to_string()),
                    }
                }
                _ => reply["error"] = json!("Not a PNG picture."),
            }
            send(&app, reply);
        }
        "pickFile" => pick_file(app.clone(), m["kind"].as_str().unwrap_or("image").to_string(), m["token"].as_str().unwrap_or_default().to_string()),
        "setWindowsWallpaperFrom" => {
            let path = m["src"].as_str().and_then(|u| media_file(&app, &from_page(&json!(u)).as_str().unwrap_or_default().to_string()));
            let mut out = m.clone();
            out["type"] = json!("setWindowsWallpaper");
            out["path"] = json!(path.map(|p| p.to_string_lossy().to_string()).unwrap_or_default());
            desktop::on_message(&app, &out);
        }
        "saveConfig" => {
            if m["config"].is_object() {
                let cfg = from_page(&m["config"]);
                write_json(&shell.data.join("config.json"), &cfg);
                *shell.config.lock().unwrap() = cfg.clone();
                desktop::sync(&app, &cfg);
            }
        }
        "scan" => send(&app, json!({ "type": "scan", "scan": scan::scan() })),
        "launch" => {
            let id = m["id"].as_str().unwrap_or_default().to_string();
            let handle = app.clone();
            std::thread::spawn(move || launch(handle, id));
        }
        "launchSkip" => shell.skip.store(true, Ordering::SeqCst),
        "setMode" => set_mode(&app, m["mode"].as_str().unwrap_or("home"), true),
        "miniSize" => {
            *shell.mini.lock().unwrap() = (m["w"].as_f64().unwrap_or(420.0), m["h"].as_f64().unwrap_or(640.0));
            if *shell.mode.lock().unwrap() == "mini" {
                set_mode(&app, "mini", false);
            }
        }
        "openItem" | "openUrl" | "open" => {
            let target = m["item"]["target"].as_str().or(m["url"].as_str()).or(m["target"].as_str()).unwrap_or_default();
            if !target.is_empty() {
                if let Err(e) = start_detached(target, m["item"]["args"].as_str().unwrap_or_default()) {
                    send(&app, json!({ "type": "notice", "ok": false, "text": format!("Couldn't open it: {e}") }));
                }
            }
        }
        "quit" => {
            desktop::close_all(&app, true);
            shell.save_state();
            app.exit(0);
        }
        "clientError" => eprintln!("page error: {}", m["text"].as_str().unwrap_or_default()),
        _ => {}
    }
}

fn main() {
    let shell = Shell::open();
    let media_dirs: Vec<PathBuf> = std::iter::once(shell.data.join("media"))
        .chain(shell.legacy.iter().map(|l| l.join("media")))
        .collect();
    tauri::Builder::default()
        .manage(shell)
        .manage(desktop::Desktop::default())
        .manage(leds::Leds::default())
        // Pictures and videos the settings point at (media.skyvaint.example in the WinForms launcher).
        .register_uri_scheme_protocol("media", move |_ctx, req| {
            let name = req.uri().path().trim_start_matches('/');
            let name = name.split('?').next().unwrap_or_default();
            let ok = !name.is_empty() && !name.contains("..") && !name.contains(':') && !name.contains('\\');
            let file = ok.then(|| media_dirs.iter().map(|d| d.join(name)).find(|p| p.is_file())).flatten();
            match file.and_then(|f| fs::read(&f).ok().map(|b| (f, b))) {
                Some((f, bytes)) => {
                    let ext = f.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
                    let mime = match ext.as_str() {
                        "png" => "image/png",
                        "jpg" | "jpeg" => "image/jpeg",
                        "gif" => "image/gif",
                        "webp" => "image/webp",
                        "svg" => "image/svg+xml",
                        "ico" => "image/x-icon",
                        "mp4" => "video/mp4",
                        "webm" => "video/webm",
                        "mp3" => "audio/mpeg",
                        "wav" => "audio/wav",
                        "ogg" => "audio/ogg",
                        _ => "application/octet-stream",
                    };
                    tauri::http::Response::builder().header("Content-Type", mime).header("Cache-Control", "max-age=31536000").body(bytes).unwrap()
                }
                None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![msg])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Open HOME", true, None::<&str>)?;
            let mini = MenuItem::with_id(app, "mini", "Mini launcher", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &mini, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Skyvaint Game Launcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => set_mode(app, "home", true),
                    "mini" => set_mode(app, "mini", true),
                    "quit" => {
                        desktop::close_all(app, true);
                        app.state::<Shell>().save_state();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        set_mode(tray.app_handle(), "home", true);
                    }
                })
                .build(app)?;
            let handle = app.handle().clone();
            std::thread::spawn(move || poll(handle));
            let handle = app.handle().clone();
            std::thread::spawn(move || desktop::mouse_loop(handle));
            let handle = app.handle().clone();
            std::thread::spawn(move || desktop::perf_loop(handle));
            Ok(())
        })
        .on_window_event(|w, e| {
            // Closing the window sends the launcher to the tray, as before.
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                if w.label() != "main" {
                    return;
                }
                api.prevent_close();
                set_mode(w.app_handle(), "hidden", true);
            }
        })
        .run(tauri::generate_context!())
        .expect("the launcher could not start");
}
