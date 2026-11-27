// LED colours through OpenRGB's SDK server (port 6742), the same as OpenRgb.cs + MainForm.Leds.cs in the WinForms
// launcher: the page sends the settings, a thread draws the effect, starting a game flashes, playing can recolour.
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
pub struct Device {
    pub index: u32,
    pub name: String,
    pub leds: usize,
    pub direct: bool,
}

pub struct Rgb {
    s: TcpStream,
    protocol: u32,
    pub devices: Vec<Device>,
}

impl Rgb {
    pub fn connect(host: &str, port: u16) -> Result<Rgb, String> {
        let addr: SocketAddr = format!("{host}:{port}").parse().map_err(|_| "Bad OpenRGB address.".to_string())?;
        let s = TcpStream::connect_timeout(&addr, Duration::from_millis(1500))
            .map_err(|_| "OpenRGB isn't answering. Open OpenRGB and start its SDK server (SDK Server tab → Start Server).".to_string())?;
        let _ = s.set_read_timeout(Some(Duration::from_secs(3)));
        let _ = s.set_nodelay(true);
        let mut r = Rgb { s, protocol: 1, devices: vec![] };
        r.send(0, 50, b"Skyvaint Game Launcher\0")?;
        r.send(0, 40, &1u32.to_le_bytes())?;
        let v = r.receive(40)?;
        r.protocol = 1.min(v.get(..4).map(|b| u32::from_le_bytes(b.try_into().unwrap())).unwrap_or(0));
        r.refresh()?;
        Ok(r)
    }

    pub fn refresh(&mut self) -> Result<(), String> {
        self.devices.clear();
        self.send(0, 0, &[])?;
        let c = self.receive(0)?;
        let count = u32::from_le_bytes(c.get(..4).ok_or("short")?.try_into().unwrap()).min(64);
        for i in 0..count {
            self.send(i, 1, &self.protocol.to_le_bytes())?;
            let d = self.receive(1)?;
            if let Some(dev) = parse(i, &d, self.protocol) {
                self.devices.push(dev);
            }
        }
        Ok(())
    }

    pub fn take_over(&mut self, d: &Device) -> Result<(), String> {
        self.send(d.index, 1100, &[])
    }

    pub fn set_leds(&mut self, d: &Device, rgb: &[u32]) -> Result<(), String> {
        let n = rgb.len().min(d.leds);
        let mut data = Vec::with_capacity(6 + n * 4);
        data.extend_from_slice(&((6 + n * 4) as u32).to_le_bytes());
        data.extend_from_slice(&(n as u16).to_le_bytes());
        for c in &rgb[..n] {
            data.extend_from_slice(&[(c >> 16) as u8, (c >> 8) as u8, *c as u8, 0]);
        }
        self.send(d.index, 1050, &data)
    }

    fn send(&mut self, dev: u32, id: u32, data: &[u8]) -> Result<(), String> {
        let mut head = Vec::with_capacity(16 + data.len());
        head.extend_from_slice(b"ORGB");
        head.extend_from_slice(&dev.to_le_bytes());
        head.extend_from_slice(&id.to_le_bytes());
        head.extend_from_slice(&(data.len() as u32).to_le_bytes());
        head.extend_from_slice(data);
        self.s.write_all(&head).map_err(|e| e.to_string())
    }

    fn receive(&mut self, want: u32) -> Result<Vec<u8>, String> {
        for _ in 0..32 {
            let mut head = [0u8; 16];
            self.s.read_exact(&mut head).map_err(|e| e.to_string())?;
            if &head[..4] != b"ORGB" {
                return Err("Not an OpenRGB server.".into());
            }
            let id = u32::from_le_bytes(head[8..12].try_into().unwrap());
            let size = u32::from_le_bytes(head[12..16].try_into().unwrap()) as usize;
            if size > 16_000_000 {
                return Err("OpenRGB sent too much.".into());
            }
            let mut data = vec![0u8; size];
            self.s.read_exact(&mut data).map_err(|e| e.to_string())?;
            if id == want {
                return Ok(data);
            }
        }
        Err("OpenRGB didn't answer.".into())
    }
}

fn parse(index: u32, b: &[u8], protocol: u32) -> Option<Device> {
    let mut p = 4usize;
    let u16_ = |p: &mut usize| -> Option<u16> { let v = u16::from_le_bytes(b.get(*p..*p + 2)?.try_into().ok()?); *p += 2; Some(v) };
    let u32_ = |p: &mut usize| -> Option<u32> { let v = u32::from_le_bytes(b.get(*p..*p + 4)?.try_into().ok()?); *p += 4; Some(v) };
    let str_ = |p: &mut usize| -> Option<String> {
        let len = u16::from_le_bytes(b.get(*p..*p + 2)?.try_into().ok()?) as usize;
        *p += 2;
        let s = String::from_utf8_lossy(b.get(*p..*p + len.saturating_sub(1))?).to_string();
        *p += len;
        Some(s)
    };
    u32_(&mut p)?; // type
    let name = str_(&mut p)?;
    if protocol >= 1 {
        str_(&mut p)?;
    }
    for _ in 0..4 {
        str_(&mut p)?;
    }
    let modes = u16_(&mut p)?;
    u32_(&mut p)?;
    let mut direct = false;
    for _ in 0..modes {
        let m = str_(&mut p)?;
        for _ in 0..(if protocol >= 3 { 12 } else { 9 }) {
            u32_(&mut p)?;
        }
        let colors = u16_(&mut p)? as usize;
        p += colors * 4;
        if m.eq_ignore_ascii_case("direct") || m.eq_ignore_ascii_case("custom") {
            direct = true;
        }
    }
    let zones = u16_(&mut p)?;
    for _ in 0..zones {
        str_(&mut p)?;
        for _ in 0..4 {
            u32_(&mut p)?;
        }
        let matrix = u16_(&mut p)? as usize;
        p += matrix;
        if protocol >= 4 {
            let segs = u16_(&mut p)?;
            for _ in 0..segs {
                str_(&mut p)?;
                for _ in 0..3 {
                    u32_(&mut p)?;
                }
            }
        }
    }
    let leds = u16_(&mut p)? as usize;
    Some(Device { index, name, leds, direct })
}

#[derive(Default)]
pub struct Leds {
    cfg: Mutex<Value>,
    accents: Mutex<(String, String)>,
    running: AtomicBool,
    pub playing: AtomicBool,
    flash_until: Mutex<Option<Instant>>,
}

impl Leds {
    pub fn flash(&self) {
        *self.flash_until.lock().unwrap() = Some(Instant::now() + Duration::from_millis(900));
    }
}

fn hex(s: Option<&str>, fallback: u32) -> u32 {
    let Some(s) = s else { return fallback };
    let s = s.trim().trim_start_matches('#');
    let s: String = if s.len() == 3 { s.chars().flat_map(|c| [c, c]).collect() } else { s.to_string() };
    s.get(..6).and_then(|h| u32::from_str_radix(h, 16).ok()).unwrap_or(fallback)
}
fn scale(c: u32, k: f64) -> u32 {
    let ch = |s: u32| (((c >> s) & 255) as f64 * k) as u32;
    (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
fn mix(a: u32, b: u32, t: f64) -> u32 {
    let t = t.clamp(0.0, 1.0);
    let ch = |s: u32| { let x = ((a >> s) & 255) as f64; let y = ((b >> s) & 255) as f64; (x + (y - x) * t) as u32 };
    (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
fn hsv(h: f64) -> u32 {
    let x = 1.0 - ((h / 60.0) % 2.0 - 1.0).abs();
    let (r, g, b) = match h as u32 { 0..=59 => (1.0, x, 0.0), 60..=119 => (x, 1.0, 0.0), 120..=179 => (0.0, 1.0, x), 180..=239 => (0.0, x, 1.0), 240..=299 => (x, 0.0, 1.0), _ => (1.0, 0.0, x) };
    (((r * 255.0) as u32) << 16) | (((g * 255.0) as u32) << 8) | ((b * 255.0) as u32)
}
fn effect(mode: &str, t: f64, f: f64, c1: u32, c2: u32, play: u32) -> u32 {
    let (dim, mode) = match mode.strip_prefix("dim:") { Some(m) => (true, m), None => (false, mode) };
    let c = match mode {
        "off" => 0,
        "playcolor" => play,
        "breathe" => scale(c1, 0.12 + 0.88 * (0.5 + 0.5 * (t * 2.2).sin())),
        "rainbow" => hsv((t * 60.0 + f * 360.0) % 360.0),
        "wave" => mix(c1, c2, 0.5 + 0.5 * (t * 2.4 + f * std::f64::consts::TAU).sin()),
        _ => c1,
    };
    if dim { scale(c, 0.25) } else { c }
}

fn wanted(cfg: &Value, d: &Device) -> bool {
    cfg["devices"][&d.name].as_bool() != Some(false)
}

fn host_port(cfg: &Value) -> (String, u16) {
    (cfg["host"].as_str().filter(|h| !h.is_empty()).unwrap_or("127.0.0.1").to_string(), cfg["port"].as_u64().filter(|p| *p > 0).unwrap_or(6742) as u16)
}

fn run(app: AppHandle) {
    let leds = app.state::<Leds>();
    let start = Instant::now();
    let mut rgb: Option<Rgb> = None;
    let mut retry = Instant::now();
    let (mut last_key, mut last_send) = (String::new(), Instant::now() - Duration::from_secs(60));
    loop {
        let cfg = leds.cfg.lock().unwrap().clone();
        if cfg["enabled"].as_bool() != Some(true) {
            break;
        }
        let (a1, a2) = leds.accents.lock().unwrap().clone();
        if rgb.is_none() {
            if Instant::now() < retry {
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            let (h, p) = host_port(&cfg);
            match Rgb::connect(&h, p) {
                Ok(mut r) => {
                    for d in r.devices.clone() {
                        if wanted(&cfg, &d) {
                            let _ = r.take_over(&d);
                        }
                    }
                    rgb = Some(r);
                    last_key.clear();
                }
                Err(_) => {
                    retry = Instant::now() + Duration::from_secs(10);
                    continue;
                }
            }
        }
        let flash_left = leds.flash_until.lock().unwrap().map(|u| u.saturating_duration_since(Instant::now()).as_millis() as f64).unwrap_or(0.0);
        let flash = flash_left > 0.0 && cfg["launchFlash"].as_bool() != Some(false);
        let mut mode = cfg["mode"].as_str().unwrap_or("theme").to_string();
        if leds.playing.load(Ordering::Relaxed) && !flash {
            match cfg["whilePlaying"].as_str().unwrap_or("keep") {
                "off" => mode = "off".into(),
                "color" => mode = "playcolor".into(),
                "dim" => mode = format!("dim:{mode}"),
                _ => {}
            }
        }
        let animated = flash || mode.contains("breathe") || mode.contains("wave") || mode.contains("rainbow");
        let bright = cfg["brightness"].as_f64().unwrap_or(1.0).clamp(0.0, 1.0);
        let speed = cfg["speed"].as_f64().unwrap_or(1.0).clamp(0.1, 5.0);
        let theme = mode.ends_with("theme") || cfg["followTheme"].as_bool() == Some(true);
        let mut c1 = hex(cfg["color"].as_str(), hex(Some(&a1), 0xff1f1f));
        let mut c2 = hex(cfg["color2"].as_str(), hex(Some(&a2), 0x8b3dff));
        if theme {
            c1 = hex(Some(&a1), c1);
            c2 = hex(Some(&a2), c2);
        }
        let play = hex(cfg["playColor"].as_str(), 0xffffff);
        let key = format!("{flash}|{mode}|{c1}|{c2}|{bright}|{play}");
        if !animated && key == last_key && last_send.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(200));
            continue;
        }
        let t = start.elapsed().as_secs_f64() * speed;
        let r = rgb.as_mut().unwrap();
        let mut failed = false;
        for d in r.devices.clone() {
            if !wanted(&cfg, &d) || d.leds == 0 {
                continue;
            }
            let px: Vec<u32> = (0..d.leds)
                .map(|i| {
                    let f = if d.leds > 1 { i as f64 / d.leds as f64 } else { 0.0 };
                    let c = if flash { mix(hex(Some(&a1), c1), 0xffffff, 0.35 + 0.65 * flash_left / 900.0) } else { effect(mode.trim_end_matches("-theme"), t, f, c1, c2, play) };
                    scale(c, bright)
                })
                .collect();
            if r.set_leds(&d, &px).is_err() {
                failed = true;
                break;
            }
        }
        if failed {
            rgb = None;
            retry = Instant::now() + Duration::from_secs(10);
            continue;
        }
        last_key = key;
        last_send = Instant::now();
        std::thread::sleep(Duration::from_millis(if animated { 33 } else { 200 }));
    }
    leds.running.store(false, Ordering::SeqCst);
}

pub fn on_message(app: &AppHandle, m: &Value) -> bool {
    let leds = app.state::<Leds>();
    match m["type"].as_str().unwrap_or_default() {
        "ledApply" => {
            *leds.cfg.lock().unwrap() = m["leds"].clone();
            *leds.accents.lock().unwrap() = (m["accent"].as_str().unwrap_or("#ff1f1f").to_string(), m["accent2"].as_str().unwrap_or("#ff4d3d").to_string());
            if m["leds"]["enabled"].as_bool() == Some(true) && !leds.running.swap(true, Ordering::SeqCst) {
                let h = app.clone();
                std::thread::spawn(move || run(h));
            }
        }
        "ledStatus" => {
            let (h, p) = host_port(&m["leds"].is_object().then(|| m["leds"].clone()).unwrap_or_else(|| leds.cfg.lock().unwrap().clone()));
            let app = app.clone();
            std::thread::spawn(move || {
                let reply = match Rgb::connect(&h, p) {
                    Ok(r) => json!({ "type": "ledStatus", "connected": true, "devices": r.devices.iter().map(|d| json!({ "index": d.index, "name": d.name, "leds": d.leds, "direct": d.direct })).collect::<Vec<_>>() }),
                    Err(e) => json!({ "type": "ledStatus", "connected": false, "error": e }),
                };
                crate::send(&app, reply);
            });
        }
        "ledFlash" => leds.flash(),
        _ => return false,
    }
    true
}
