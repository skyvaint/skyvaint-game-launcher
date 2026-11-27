# Notes for Claude sessions working on this repo

## Never touch the real user data

The launcher's real data is the user's own setup: games, Roblox/Epic/Steam accounts, NEXUS bars, playtime,
quests and custom pictures. It lives in:

- `%APPDATA%\SkyvaintGameLauncher\` (`config.json`, `state.json`, `media\`)
- `%LOCALAPPDATA%\SkyvaintGameLauncher\` (WebView data, and `backups\`)
- `%LOCALAPPDATA%\SkyvaintRobloxManager\webview\` (Roblox account sign-ins)

Rules:

- **Do not delete, move, rename, replace or "reset" any of these**, not even to test first-run or onboarding.
- **Do not copy test configs over `config.json`.**
- To test a build, run it on a throw-away data folder:

  ```bash
  dotnet build -c Release
  bin\Release\net9.0-windows\SkyvaintGameLauncher.exe --data "%TEMP%\sv-test"
  ```

  `--data` keeps every file of that run inside the given folder. It also uses its own single-instance names, so it
  runs next to the real launcher. To test a fresh install, point `--data` at an empty folder.
- To rebuild the user's real copy, close the running launcher first (tray → Quit). Don't kill it while it saves.
  Then build. Only data in `bin/`, `obj/` and `publish/` may be replaced.

If the user's data does get lost, backups are in `%LOCALAPPDATA%\SkyvaintGameLauncher\backups\`. The launcher
restores from them by itself on start, and Settings → UPDATES → BACKUPS can restore a chosen one (see `DataSafety.cs`).

## Never start the launcher from a Claude shell

The Claude desktop app is a packaged (MSIX) app. Windows gives it, and every program it starts, a **virtual copy of
AppData** (`%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\...`). A launcher started from a
Claude shell or tool therefore reads and writes a *different* `config.json` than the one the user's own shortcut
uses, and the user's setup seems to "reset" or "come back wrong" after every rebuild. Reading or writing
`%APPDATA%\SkyvaintGameLauncher` through Claude's file tools hits that virtual copy too.

- Build with `build-and-run.cmd`, started from File Explorer (double-click), not from a Claude shell.
- Don't copy, export or upload the user's settings. Don't edit them with Claude's file tools either (those only reach
  the virtual copy). If a settings change is really needed, ask the user first.

## Page sleep

A while after the window goes to the tray the WebView2 is closed for real (`MainForm.Sleep.cs`) and reloads when the launcher is shown.
Work that must carry on while you play belongs in the shell, not the page. A message from the shell that needs the page even while hidden has to be listed in `NeedsPage`.

## Controller and hover

While a controller is in use, `body[data-input=pad]` hides the pointer and turns pointer events off. In `css/ui.css`, animate only transform and opacity.

## Tauri shell (tauri/src-tauri)

Version 3 is a Rust/Tauri shell around the same `wwwroot` page (`host.js` picks Tauri first, then WebView2). Build with
`cargo build --release --features custom-protocol` in `tauri/src-tauri`; the page files are packed into the exe, so rebuild after page edits.
Its own data folder is `%APPDATA%\SkyvaintLauncherNext` (first start copies config/state from the old launcher, which is only read); test with `--data`.
Desktop wallpapers sit behind the icons by re-parenting into Explorer's Progman/WorkerW (`desktop.rs`, `MainForm.DesktopWall.cs`).
Explorer's windows can be inspected from a Claude shell. From PowerShell, pass `[IntPtr]::Zero` for an unused title (`$null` becomes an
empty string and finds nothing), and use `GetAncestor(h, GA_PARENT)`: `GetParent` returns the owner for pop-up windows.
