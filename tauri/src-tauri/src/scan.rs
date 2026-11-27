// Finds installed games: Steam libraries and Epic manifests (a port of GameScanner.cs, without the account work).
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

fn clean(name: &str) -> String {
    name.replace('®', "").replace('™', "").trim().to_string()
}

pub fn scan() -> Vec<Value> {
    let mut found = Vec::new();
    scan_epic(&mut found);
    scan_steam(&mut found);
    scan_roblox(&mut found);
    found
}

fn scan_epic(found: &mut Vec<Value>) {
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into());
    let dir = Path::new(&program_data).join("Epic\\EpicGamesLauncher\\Data\\Manifests");
    let Ok(entries) = fs::read_dir(&dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else { continue };
        let Ok(j) = serde_json::from_str::<Value>(&text) else { continue };
        let is_game = j["AppCategories"].as_array().map_or(false, |c| c.iter().any(|v| v == "games"));
        if !is_game {
            continue;
        }
        let app = j["AppName"].as_str().unwrap_or_default();
        let name = clean(j["DisplayName"].as_str().unwrap_or(app));
        let exe = j["LaunchExecutable"].as_str().unwrap_or_default();
        let proc_name = j["MainWindowProcessName"].as_str().filter(|s| !s.trim().is_empty()).unwrap_or(exe);
        let stem = Path::new(&proc_name.replace('/', "\\"))
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        found.push(json!({
            "scanId": format!("epic_{app}"),
            "name": name,
            "platform": "epic",
            "target": format!("com.epicgames.launcher://apps/{app}?action=launch&silent=true"),
            "process": stem,
            "installed": true,
        }));
    }
}

#[cfg(windows)]
fn steam_root() -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam").ok()?;
    let path: String = key.get_value("SteamPath").ok()?;
    let p = PathBuf::from(path.replace('/', "\\"));
    p.is_dir().then_some(p)
}
#[cfg(not(windows))]
fn steam_root() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    [".steam/steam", ".local/share/Steam", "Library/Application Support/Steam"]
        .iter()
        .map(|s| Path::new(&home).join(s))
        .find(|p| p.is_dir())
}

fn scan_steam(found: &mut Vec<Value>) {
    let Some(steam) = steam_root() else { return };
    let mut libs = vec![steam.clone()];
    if let Ok(vdf) = fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        let re = Regex::new(r#""path"\s+"([^"]+)""#).unwrap();
        for c in re.captures_iter(&vdf) {
            libs.push(PathBuf::from(c[1].replace("\\\\", "\\")));
        }
    }
    let re_id = Regex::new(r#""appid"\s+"(\d+)""#).unwrap();
    let re_name = Regex::new(r#""name"\s+"([^"]+)""#).unwrap();
    let re_owner = Regex::new(r#""LastOwner"\s+"(\d{17})""#).unwrap();
    let mut seen = HashSet::new();
    let mut lib_seen = HashSet::new();
    for lib in libs {
        let key = lib.to_string_lossy().to_lowercase();
        if !lib_seen.insert(key) {
            continue;
        }
        let Ok(entries) = fs::read_dir(lib.join("steamapps")) else { continue };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().to_string();
            if !(file.starts_with("appmanifest_") && file.ends_with(".acf")) {
                continue;
            }
            let Ok(text) = fs::read_to_string(entry.path()) else { continue };
            let (Some(id), Some(name)) = (re_id.captures(&text), re_name.captures(&text)) else { continue };
            let id = id[1].to_string();
            if id == "228980" || !seen.insert(id.clone()) {
                continue;
            }
            let owners: Vec<String> = re_owner.captures(&text).map(|c| vec![c[1].to_string()]).unwrap_or_default();
            let cdn = format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{id}");
            found.push(json!({
                "scanId": format!("steam_{id}"),
                "name": clean(&name[1]),
                "platform": "steam",
                "target": format!("steam://rungameid/{id}"),
                "process": "",
                "installed": true,
                "owners": owners,
                "cover": format!("{cdn}/library_600x900.jpg"),
                "hero": format!("{cdn}/library_hero.jpg"),
            }));
        }
    }
}

/// The command Windows runs for a protocol such as roblox-player, split into the program and its arguments.
#[cfg(windows)]
pub fn protocol_command(protocol: &str) -> Option<(String, String)> {
    use winreg::{enums::*, RegKey};
    let path = format!("Software\\Classes\\{protocol}\\shell\\open\\command");
    let cmd: String = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(&path)
        .or_else(|_| RegKey::predef(HKEY_CLASSES_ROOT).open_subkey(format!("{protocol}\\shell\\open\\command")))
        .ok()?
        .get_value("")
        .ok()?;
    let cmd = cmd.trim();
    let (exe, rest) = if let Some(stripped) = cmd.strip_prefix('"') {
        let end = stripped.find('"')?;
        (stripped[..end].to_string(), stripped[end + 1..].trim().to_string())
    } else {
        let mut parts = cmd.splitn(2, ' ');
        (parts.next()?.to_string(), parts.next().unwrap_or_default().to_string())
    };
    // "%1" is the link Windows would pass; started on its own, the app simply opens.
    let args = rest.replace("\"%1\"", "").replace("%1", "").trim().to_string();
    Path::new(&exe).is_file().then_some((exe, args))
}
#[cfg(not(windows))]
pub fn protocol_command(_protocol: &str) -> Option<(String, String)> {
    None
}

fn scan_roblox(found: &mut Vec<Value>) {
    if protocol_command("roblox-player").is_some() {
        found.push(json!({ "scanId": "roblox_player", "name": "Roblox", "platform": "roblox", "target": "sv:roblox", "process": "RobloxPlayerBeta", "installed": true }));
    }
    if protocol_command("roblox-studio").is_some() {
        found.push(json!({ "scanId": "roblox_studio", "name": "Roblox Studio", "platform": "roblox", "target": "sv:roblox-studio", "process": "RobloxStudioBeta", "installed": true }));
    }
}
