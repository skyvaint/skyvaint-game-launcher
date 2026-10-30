# SKYVAINT Game Launcher

A console-style game launcher for Windows: one fullscreen HOME for your Steam, Epic, Roblox and PC games, with account switching, clips, quests and a desktop dock.

## Install

1. Open **[Releases](../../releases/latest)** and download `SkyvaintGameLauncher-win-x64.zip`.
2. Unzip it anywhere (for example `Documents\SkyvaintGameLauncher`).
3. Run **`SkyvaintGameLauncher.exe`**.
   - If Windows SmartScreen says "Windows protected your PC", click **More info → Run anyway**. The app isn't code-signed, which is why that appears.

**Needs:** Windows 10 or 11 (64-bit) and the Microsoft Edge WebView2 Runtime, which Windows 11 already has. On an older PC without it, get it from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/#download-section) (Evergreen Bootstrapper).

Your settings and accounts are saved in `%APPDATA%\SkyvaintGameLauncher` on your own PC. Nothing is uploaded anywhere. Backups are kept in `%LOCALAPPDATA%\SkyvaintGameLauncher\backups` and put back by themselves if the settings ever go missing.

## What it does

- **Games:** finds your whole Steam library, Epic games, Roblox and Roblox Studio, and you can add any .exe. A new install starts empty and fills itself from what's on the PC. Stores with nothing found yet show a card to get or link them. Banners and icons are fetched automatically, and your own pictures always take priority.
- **Accounts:**
  - Pick which Epic account plays Fortnite or Rocket League, and switch smoothly between them.
  - Steam account switching.
  - A Roblox account manager: multiple accounts, places, private-server links, several instances at once.
- **Roblox list:** picking Roblox opens a shelf of your saved places. Roblox Studio opens your recent and cloud projects.
- **Clips:** your Medal library on HOME and in CLIPS, with favorites, your own categories and copy-Medal-link.
- **Quests:**
  - Daily and weekly quests that track themselves from your playtime and clips.
  - In-game challenges, lifetime milestones, and quests you write yourself.
  - XP and ranks.
- **Discover:** free Epic games, Steam top sellers and deals, trending Roblox games.
- **Details:** any game opens a details screen with your playtime plus the store's or Roblox's description, stats and screenshots.
- **Rows under HOME:** scroll down for what you played last, your Roblox friends (online status, the game they're in, JOIN), your Roblox games, Studio projects, upcoming releases, Roblox Studio news and Discord commission requests (needs your own bot).
- **NEXUS bar:** a see-through desktop dock with just the logos of the apps, games and sites you pick.
- **Discord Rich Presence:** you write the text and buttons yourself.
- **Looks:**
  - Themes, textures and an animated backdrop that runs on its own thread, so it keeps your monitor's full frame rate.
  - Sound packs, a custom app icon, the mini widget, and a fade-out when hiding to the tray.
- **Controls:** keyboard, mouse and controller. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Home</kbd> summons it from anywhere.

## Build from source

Needs the [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0).

```bash
dotnet build -c Release
```

The app is in `bin\Release\net9.0-windows\`. To make the same self-contained zip as the release:

```bash
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish
```

The shell is WinForms + WebView2 (C#). The whole interface is plain HTML, CSS and JavaScript in `wwwroot/`.

### Command-line switches

| Switch | What it does |
|---|---|
| `--background` | Start hidden in the tray |
| `--debug-port 9333` | Open the page to Edge/Chrome dev tools |
| `--dump <folder>` | Write what the game and clip scanners find, then exit |
| `--data <folder>` | Run on a separate data folder (for testing builds): your real settings are not touched |
