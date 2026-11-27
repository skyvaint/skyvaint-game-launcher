// The desktop: per screen, a wallpaper window drawn behind the desktop icons (inside Explorer's WorkerW, the way
// Lively and Wallpaper Engine do it) and a see-through window just above the desktop for your icons and widgets.
// The widget window lets the mouse through everywhere except over a widget.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Monitor, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
pub struct Desktop {
    /// Widget windows: label → (monitor x, y, scale, widget rectangles in CSS px).
    pub tops: Mutex<HashMap<String, (f64, f64, f64, Vec<[f64; 4]>)>>,
    pub dragging: Mutex<Option<String>>,
    pub through: Mutex<HashMap<String, bool>>,
    pub walls: Mutex<Vec<String>>,
    pub look: Mutex<Value>,
    /// What the windows were built for, so a settings save that changes nothing else doesn't rebuild them.
    pub built: Mutex<String>,
}

fn key(name: &str) -> String {
    name.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase()
}

fn monitor_name(m: &Monitor, i: usize) -> String {
    m.name().cloned().unwrap_or_else(|| format!("screen{}", i + 1))
}

/// The screens, for the settings page: same shape as the WinForms launcher sends.
pub fn screens(app: &AppHandle) -> Value {
    let Some(w) = app.get_webview_window("main") else { return json!([]) };
    let all = w.available_monitors().unwrap_or_default();
    let primary = w.primary_monitor().ok().flatten().map(|m| monitor_name(&m, 0));
    let current = w.current_monitor().ok().flatten().map(|m| monitor_name(&m, 0));
    Value::Array(
        all.iter()
            .enumerate()
            .map(|(i, m)| {
                let name = monitor_name(m, i);
                let is_primary = primary.as_deref() == Some(&name);
                json!({
                    "name": name,
                    "label": format!("Screen {} · {}×{}{}", i + 1, m.size().width, m.size().height, if is_primary { " · main" } else { "" }),
                    "primary": is_primary,
                    "current": current.as_deref() == Some(&name),
                })
            })
            .collect(),
    )
}

fn enabled(cfg: &Value) -> bool {
    cfg["desktop"]["enabled"].as_bool().unwrap_or(false)
}

fn wall_of<'a>(cfg: &'a Value, name: &str) -> &'a Value {
    let d = &cfg["desktop"];
    if d["sameOnAll"].as_bool().unwrap_or(true) {
        &d["all"]
    } else {
        let s = &d["screens"][name];
        if s.is_object() { s } else { &d["all"] }
    }
}

fn wants_wall(cfg: &Value, name: &str) -> bool {
    let k = wall_of(cfg, name)["kind"].as_str().unwrap_or("none");
    k != "none" && k != ""
}

fn wants_top(cfg: &Value) -> bool {
    cfg["widgets"]["items"].as_array().map_or(false, |a| a.iter().any(|w| w["enabled"].as_bool() != Some(false)))
}

/// What the desktop pages need: settings for the wallpaper and widgets, the games (for icons) and the colours.
fn payload(app: &AppHandle, cfg: &Value) -> Value {
    let games: Vec<Value> = cfg["games"]
        .as_array()
        .map(|a| a.iter().map(|g| json!({ "id": g["id"], "name": g["name"], "icon": g["icon"], "cover": g["cover"] })).collect())
        .unwrap_or_default();
    let main = app.get_webview_window("main");
    let primary = main.as_ref().and_then(|w| w.primary_monitor().ok().flatten()).map(|m| (m.position().x, m.position().y));
    let monitors: Vec<Value> = main
        .and_then(|w| w.available_monitors().ok())
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (x, y) = (m.position().x, m.position().y);
            json!({ "x": x, "y": y, "w": m.size().width, "h": m.size().height, "primary": primary == Some((x, y)) })
        })
        .collect();
    json!({
        "monitors": monitors,
        "desktop": cfg["desktop"],
        "widgets": cfg["widgets"],
        "games": games,
        "look": app.state::<Desktop>().look.lock().unwrap().clone(),
        "clock24": cfg["behavior"]["clock24"],
    })
}

/// Builds, rebuilds or removes the desktop windows to match the settings, then hands them the settings.
pub fn sync(app: &AppHandle, cfg: &Value) {
    // One at a time: the start-up and a colour change can both ask at once.
    static BUSY: Mutex<()> = Mutex::new(());
    let _one = BUSY.lock().unwrap_or_else(|e| e.into_inner());
    let Some(main) = app.get_webview_window("main") else { return };
    let monitors = main.available_monitors().unwrap_or_default();
    let on = enabled(cfg);
    let plan: Vec<(String, bool, bool)> = monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let n = monitor_name(m, i);
            (n.clone(), on && wants_wall(cfg, &n), on && wants_top(cfg))
        })
        .collect();
    let shape = format!(
        "{:?}{:?}",
        plan,
        monitors.iter().map(|m| (m.position().x, m.position().y, m.size().width, m.size().height)).collect::<Vec<_>>()
    );
    let state = app.state::<Desktop>();
    let rebuild = *state.built.lock().unwrap() != shape;
    if rebuild {
        close_all(app, false);
        for (i, m) in monitors.iter().enumerate() {
            let (name, wall, top) = &plan[i];
            if *wall {
                open_window(app, "wall", i, name, m);
            }
            if *top {
                open_window(app, "top", i, name, m);
            }
        }
        *state.built.lock().unwrap() = shape;
    }
    let data = crate::to_page(&payload(app, cfg));
    for (label, _) in app.webview_windows() {
        if label.starts_with("wall-") || label.starts_with("top-") {
            let _ = app.emit_to(label.as_str(), "desktop", data.clone());
        }
    }
}

fn open_window(app: &AppHandle, layer: &str, i: usize, name: &str, m: &Monitor) {
    let label = format!("{layer}-{i}");
    let (pos, size, scale) = (m.position(), m.size(), m.scale_factor());
    let url = format!(
        "desktop.html?layer={layer}&label={label}&screen={}&x={}&y={}&w={}&h={}&s={}",
        key(name),
        pos.x,
        pos.y,
        size.width,
        size.height,
        scale
    );
    let top = layer == "top";
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(if top { "Skyvaint widgets" } else { "Skyvaint wallpaper" })
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .shadow(false)
        .transparent(top)
        .always_on_bottom(top)
        .build();
    let Ok(w) = built else { return };
    let _ = w.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
    let _ = w.set_size(tauri::PhysicalSize::new(size.width, size.height));
    if top {
        let _ = w.set_ignore_cursor_events(true);
        app.state::<Desktop>().tops.lock().unwrap().insert(label.clone(), (pos.x as f64, pos.y as f64, scale, vec![]));
        app.state::<Desktop>().through.lock().unwrap().insert(label, true);
        let _ = w.show();
    } else {
        #[cfg(windows)]
        if let Ok(h) = w.hwnd() {
            win::behind_icons(h, pos.x, pos.y, size.width as i32, size.height as i32);
        }
        let _ = w.show();
        app.state::<Desktop>().walls.lock().unwrap().push(label);
    }
}

/// Closes every desktop window. On quit, Windows is asked to draw its own wallpaper again over what was left.
pub fn close_all(app: &AppHandle, quitting: bool) {
    let st = app.state::<Desktop>();
    let had_walls = !st.walls.lock().unwrap().is_empty();
    for (label, w) in app.webview_windows() {
        if label.starts_with("wall-") || label.starts_with("top-") {
            let _ = w.destroy();
        }
    }
    st.tops.lock().unwrap().clear();
    st.through.lock().unwrap().clear();
    st.walls.lock().unwrap().clear();
    st.built.lock().unwrap().clear();
    #[cfg(windows)]
    if had_walls || quitting {
        win::redraw_wallpaper();
    }
}

/// Lets the mouse through a widget window except over its widgets. Runs for the launcher's whole life.
pub fn mouse_loop(app: AppHandle) {
    loop {
        std::thread::sleep(Duration::from_millis(40));
        let st = app.state::<Desktop>();
        let tops = st.tops.lock().unwrap().clone();
        if tops.is_empty() {
            std::thread::sleep(Duration::from_millis(400));
            continue;
        }
        #[cfg(windows)]
        let Some((cx, cy)) = win::cursor() else { continue };
        #[cfg(not(windows))]
        let (cx, cy) = (0.0, 0.0);
        let dragging = st.dragging.lock().unwrap().clone();
        for (label, (mx, my, scale, rects)) in tops {
            let over = dragging.as_deref() == Some(&label)
                || rects.iter().any(|r| {
                    let (x, y) = ((cx - mx) / scale, (cy - my) / scale);
                    x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3]
                });
            let through = !over;
            let mut map = st.through.lock().unwrap();
            if map.get(&label) != Some(&through) {
                if let Some(w) = app.get_webview_window(&label) {
                    let _ = w.set_ignore_cursor_events(through);
                }
                map.insert(label, through);
            }
        }
    }
}

/// CPU and memory for the performance widget, every 2 seconds while there are widget windows.
pub fn perf_loop(app: AppHandle) {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
    let mut sys = System::new_with_specifics(RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing().with_cpu_usage()).with_memory(MemoryRefreshKind::nothing().with_ram()));
    loop {
        std::thread::sleep(Duration::from_secs(2));
        let labels: Vec<String> = app.state::<Desktop>().tops.lock().unwrap().keys().cloned().collect();
        if labels.is_empty() {
            continue;
        }
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let msg = json!({
            "cpu": sys.global_cpu_usage().round(),
            "ram": (sys.used_memory() as f64 / sys.total_memory().max(1) as f64 * 100.0).round(),
            "usedGb": (sys.used_memory() as f64 / 1073741824.0 * 10.0).round() / 10.0,
            "totalGb": (sys.total_memory() as f64 / 1073741824.0 * 10.0).round() / 10.0,
        });
        for l in labels {
            let _ = app.emit_to(l.as_str(), "perf", msg.clone());
        }
    }
}

/// Messages from the desktop pages and the desktop settings. Returns false for anything else.
pub fn on_message(app: &AppHandle, m: &Value) -> bool {
    let st = app.state::<Desktop>();
    match m["type"].as_str().unwrap_or_default() {
        "desktopReady" => {
            let cfg = app.state::<crate::Shell>().config.lock().unwrap().clone();
            let data = crate::to_page(&payload(app, &cfg));
            let _ = app.emit_to(m["label"].as_str().unwrap_or_default(), "desktop", data);
        }
        "desktopRects" => {
            let label = m["label"].as_str().unwrap_or_default();
            let rects: Vec<[f64; 4]> = m["rects"]
                .as_array()
                .map(|a| a.iter().filter_map(|r| Some([r[0].as_f64()?, r[1].as_f64()?, r[2].as_f64()?, r[3].as_f64()?])).collect())
                .unwrap_or_default();
            if let Some(t) = st.tops.lock().unwrap().get_mut(label) {
                t.3 = rects;
            }
        }
        "desktopDrag" => {
            *st.dragging.lock().unwrap() = m["on"].as_bool().unwrap_or(false).then(|| m["label"].as_str().unwrap_or_default().to_string());
        }
        "desktopLook" => {
            *st.look.lock().unwrap() = json!({ "accent": m["accent"], "accent2": m["accent2"], "font": m["font"] });
            let cfg = app.state::<crate::Shell>().config.lock().unwrap().clone();
            sync(app, &cfg);
        }
        "widgetMoved" => {
            let id = m["id"].clone();
            let shell = app.state::<crate::Shell>();
            {
                let mut cfg = shell.config.lock().unwrap();
                if let Some(items) = cfg["widgets"]["items"].as_array_mut() {
                    if let Some(w) = items.iter_mut().find(|w| w["id"] == id) {
                        w["x"] = m["x"].clone();
                        w["y"] = m["y"].clone();
                    }
                }
                crate::write_json(&shell.data.join("config.json"), &cfg);
            }
            crate::send(app, json!({ "type": "widgetEdit", "op": "moved", "id": id, "x": m["x"], "y": m["y"] }));
        }
        "screens" => crate::send(app, json!({ "type": "screens", "screens": screens(app) })),
        "desktopRefresh" => {
            st.built.lock().unwrap().clear();
            let cfg = app.state::<crate::Shell>().config.lock().unwrap().clone();
            sync(app, &cfg);
        }
        "setWindowsWallpaper" => {
            #[cfg(windows)]
            {
                let path = m["path"].as_str().unwrap_or_default().to_string();
                let rect = m["screen"].as_str().and_then(|s| screen_rect(app, s));
                let ok = win::set_windows_wallpaper(&path, rect);
                crate::send(app, json!({ "type": "notice", "ok": ok, "text": if ok { "Windows wallpaper set." } else { "Windows didn't take that picture." } }));
            }
        }
        _ => return false,
    }
    true
}

fn screen_rect(app: &AppHandle, wanted: &str) -> Option<(i32, i32, i32, i32)> {
    let main = app.get_webview_window("main")?;
    let all = main.available_monitors().ok()?;
    all.iter()
        .enumerate()
        .find(|(i, m)| monitor_name(m, *i) == wanted || key(&monitor_name(m, *i)) == wanted)
        .map(|(_, m)| (m.position().x, m.position().y, m.size().width as i32, m.size().height as i32))
}

#[cfg(windows)]
mod win {
    use windows::core::{w, BOOL, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{DesktopWallpaper, IDesktopWallpaper};
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe extern "system" fn find_worker(top: HWND, lp: LPARAM) -> BOOL {
        if FindWindowExW(Some(top), None, w!("SHELLDLL_DefView"), PCWSTR::null()).is_ok() {
            if let Ok(worker) = FindWindowExW(None, Some(top), w!("WorkerW"), PCWSTR::null()) {
                *(lp.0 as *mut HWND) = worker;
            }
        }
        BOOL(1)
    }

    /// Puts a window behind the desktop icons, over Windows' own wallpaper.
    pub fn behind_icons(h: HWND, x: i32, y: i32, wd: i32, ht: i32) {
        unsafe {
            let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) else { return };
            // Asks Explorer to split off the window that holds the wallpaper.
            let mut r = 0usize;
            let _ = SendMessageTimeoutW(progman, 0x052C, WPARAM(0xD), LPARAM(1), SMTO_NORMAL, 1000, Some(&mut r));
            let _ = SendMessageTimeoutW(progman, 0x052C, WPARAM(0), LPARAM(0), SMTO_NORMAL, 1000, Some(&mut r));
            let (vx, vy) = (GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN));
            let defview = FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), PCWSTR::null()).ok();
            if let Some(defview) = defview {
                // Windows 11 24H2 and later: the icons and the wallpaper both live inside Progman. Go between them.
                let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
                SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_LAYERED.0 as isize);
                let _ = SetLayeredWindowAttributes(h, windows::Win32::Foundation::COLORREF(0), 255, LWA_ALPHA);
                let _ = SetParent(h, Some(progman));
                let _ = SetWindowPos(h, Some(defview), x - vx, y - vy, wd, ht, SWP_NOACTIVATE);
                return;
            }
            // Older Windows: a WorkerW next to the one holding the icons.
            let mut worker = HWND::default();
            let _ = EnumWindows(Some(find_worker), LPARAM(&mut worker as *mut HWND as isize));
            if worker.is_invalid() {
                return;
            }
            let _ = SetParent(h, Some(worker));
            let _ = SetWindowPos(h, None, x - vx, y - vy, wd, ht, SWP_NOACTIVATE | SWP_NOZORDER);
        }
    }

    /// Windows draws its own wallpaper again (the same one: nothing is changed or saved).
    pub fn redraw_wallpaper() {
        unsafe {
            let mut buf = [0u16; 520];
            if SystemParametersInfoW(SPI_GETDESKWALLPAPER, buf.len() as u32, Some(buf.as_mut_ptr() as *mut _), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)).is_ok() {
                let _ = SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, Some(buf.as_mut_ptr() as *mut _), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0));
            }
        }
    }

    pub fn cursor() -> Option<(f64, f64)> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p).ok()? };
        Some((p.x as f64, p.y as f64))
    }

    /// Sets the real Windows wallpaper (stays after the launcher closes): on one screen, or on all of them.
    pub fn set_windows_wallpaper(path: &str, screen: Option<(i32, i32, i32, i32)>) -> bool {
        if !std::path::Path::new(path).is_file() {
            return false;
        }
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let Ok(dw) = CoCreateInstance::<_, IDesktopWallpaper>(&DesktopWallpaper, None, CLSCTX_ALL) else { return false };
            let file = HSTRING::from(path);
            match screen {
                None => dw.SetWallpaper(PCWSTR::null(), &file).is_ok(),
                Some((x, y, _, _)) => {
                    let n = dw.GetMonitorDevicePathCount().unwrap_or(0);
                    for i in 0..n {
                        let Ok(id) = dw.GetMonitorDevicePathAt(i) else { continue };
                        if let Ok(r) = dw.GetMonitorRECT(PCWSTR(id.0)) {
                            if r.left == x && r.top == y {
                                return dw.SetWallpaper(PCWSTR(id.0), &file).is_ok();
                            }
                        }
                    }
                    false
                }
            }
        }
    }
}
