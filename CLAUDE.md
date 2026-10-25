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
