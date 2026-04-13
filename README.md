<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" alt="Another app icon" />
</p>

<h1 align="center">Another</h1>


Fork from "https://github.com/Zfinix/another". :3 Built to make the UI shortcut first and eliminate struggles in the UI by switching to tailwindcss and shadcn. Hotkeys based. MCP/AI eliminated, as well as mac builds cuz i cant personally sign them and whatever, dont have a Mac. Also to fix windows issues in terminal spamming in the communication to the CLI. 

A desktop app for mirroring and controlling Android devices. Built with Tauri, React, and Rust.

![Another](shot.png)

Uses a bundled [scrcpy-server](https://github.com/Genymobile/scrcpy) to stream video from the device and send control inputs back.

## Download

Check releases



## Features

- Real-time screen mirroring via H.264/H.265 decoding
- Adaptive video bitrate that adjusts in real-time based on screen activity
- Macros -- record, replay, import, export, and rename device interactions
- Device nicknames -- give your devices custom names
- WiFi mirroring -- go wireless with one click
- Device audio forwarding (Android 11+)
- Screen recording (saves as .webm)
- Touch, keyboard, scroll, and navigation input forwarding
- Command bar with keyboard shortcuts for every action
- Configurable video quality (resolution, FPS, bitrate, codec)
- Screenshot capture
- Automatic device detection via ADB
- Light/dark/auto theme

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Command Bar |
| `⌘S` | Screenshot |
| `⌘⇧R` | Record / Stop Recording |
| `⌘+` / `⌘-` | Volume Up / Down |
| `⌘M` | Mute / Unmute Audio |
| `⌘H` | Home |
| `⌘B` | Back |
| `⌘R` | Recent Apps |
| `⌘P` | Power |
| `⌘⇧M` | Record / Stop Macro |
| `⌘D` | Disconnect |
| `⌘T` | Toggle Theme |
| `⌘,` | Settings |


## Platform Support

| Platform | Status |
|----------|--------|
| macOS | Supported |
| Linux | Experimental |
| Windows | Experimental |

## Prerequisites

- An Android device connected via USB with USB debugging enabled (or WiFi debugging)
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) and [Bun](https://bun.sh/)

## Development

```sh
bun install
bun tauri dev
```

#### For Ubuntu/Debian (including WSL)

You need to install the development packages for WebKitGTK, ALSA, and pkg-config.

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev  pkg-config libasound2-dev
```

## Build

```sh
bun tauri build
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Base UI
- **Backend:** Rust, Tauri 2, Tokio, rodio
- **Device communication:** ADB + scrcpy-server v2.7
