<p align="center">
  <img src="https://raw.githubusercontent.com/GreedIsLost/GreedyTool-V.0.1/main/assets/banner.svg" width="600" alt="GreedyTool">
</p>

<p align="center">
  <b>Steam Manifest & Lua Tool</b><br>
  <i>Generate manifests, download from CDN, unlock achievements, boost hours.</i>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white" alt="Electron"></a>
  <a href="#"><img src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="#"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs"></a>
</p>

<br>

> **For Educational & Research Purposes Only**

<br>

---

## Overview

A desktop tool for generating Lua and ACF manifests, downloading real depot manifests from the Steam CDN, boosting playtime hours, and managing your library — all wrapped in a native Electron interface with built-in SAM support.

---

## Features

<br>

<table>
  <tr>
    <td width="50%" align="center"><b>Generate</b><br><sub>Enter an App ID, get Lua + ACF in one click</sub></td>
    <td width="50%" align="center"><b>CDN Download</b><br><sub>12-mirror fallback for real depot manifests</sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>Import + Restart</b><br><sub>Inject manifests and restart Steam automatically</sub></td>
    <td width="50%" align="center"><b>Batch Process</b><br><sub>Queue App IDs with concurrency control</sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>Manifest Decoder</b><br><sub>Inspect <code>.manifest</code> binary files</sub></td>
    <td width="50%" align="center"><b>Achievement Unlocker</b><br><sub>Bundled SAM — launch with one click</sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>Hour Booster</b><br><sub>Idle any game to accumulate playtime hours</sub></td>
    <td width="50%" align="center"><b>Drag & Drop</b><br><sub>Drop store links or raw App IDs</sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>Backup Export</b><br><sub>Package manifests + Lua into <code>.zip</code></sub></td>
    <td width="50%" align="center"><b>Drag & Drop</b><br><sub>Drop store links or raw App IDs</sub></td>
  </tr>
</table>

---

## Quick Start

```bash
git clone https://github.com/GreedIsLost/GreedyTool-V.0.1.git
cd GreedyTool-V.0.1
npm install       # also downloads SAM.Picker.exe
npm start
```

---

## How It Works

```
                  +-------------+
                  |   App ID    |
                  +------+------+
                         |
                         v
                 +-------+--------+
                 |  Steam Store   |
                 |     API        |
                 +-------+--------+
                         |
                         v
                 +-------+--------+
                 |  Depot Lookup  |
                 +-------+--------+
                         |
           +-------------+-------------+
           |                           |
           v                           v
  +--------+---------+       +---------+--------+
  |  SteamDB Scrape  |       |  CDN Download    |
  |   (fallback)     |       |  (12 mirrors)    |
  +------------------+       +---------+--------+
                                         |
                                         v
                                 +--------+---------+
                                 |  Lua + ACF Gen   |
                                 +--------+---------+
                                          |
                   +----------------------+----------------------+----------------------+
                   |                      |                      |                      |
                   v                      v                      v                      v
          +--------+-------+    +--------+-------+    +--------+-------+    +--------+-------+
          | Import to Steam |    |  Export .zip    |    | Launch SAM      |    | Hour Booster   |
          | + Restart       |    |  Backup         |    | (achievements)  |    | (idle any game)|
          +-----------------+    +-----------------+    +-----------------+    +---------------+
```

---

## Project Structure

```
GreedyTool/
+-- main.js                     Electron main process
+-- preload.js                  Context bridge (IPC API)

+-- renderer/
|   +-- index.html              UI layout
|   +-- app.js                  UI logic

+-- core/
|   +-- idler.js                Steam hour booster (steam-user)
|   +-- sam.js                  SAM detection, launch, download
|   +-- sam-download.js          Shared download utils (SAM)
|   +-- setup-sam.js            Postinstall bundler for SAM
|   +-- manifest.js             Process pipeline orchestrator
|   +-- downloader.js           CDN download (12 mirrors)
|   +-- steamkit.js             Depot lookup (API -> SteamDB -> common)
|   +-- steamapi.js             Steam Store API client
|   +-- lua.js                  Lua manifest generator
|   +-- utils.js                ACF manifest generator
|   +-- protobuf.js             Steam protobuf decoder
|   +-- cache.js                Local manifest cache
|   +-- exporter.js             ZIP backup exporter
|   +-- history.js              Session persistence
|   +-- updater.js              Self-updater
|   +-- ipc/
|       +-- app.js              SAM, file picker, cache, settings
|       +-- idler.js            Idler IPC handlers
|       +-- library.js          Import to Steam
|       +-- steam.js            Process, search, details

+-- sam/
|   +-- SAM.Picker.exe          (downloaded by postinstall)

+-- package.json
```

---

## Advanced

### Environment Variables

| Variable | Effect |
|---|---|
| `NODE_ENV=development` | Auto-open DevTools on launch |

### Concurrency

Batch processing runs **3 concurrent downloads** to stay under rate limits.

### CDN Fallback

```
content-1.steampowered.com  ...  content-8.steampowered.com
  -> cloudflare.steampowered.com
    -> steamstatic.com (with .crc)
      -> steamstatic.com (without .crc)
```

### Hour Booster

The **Idler** tool (Tools > Idler) uses `steam-user` to log into Steam and send play heartbeats for any App ID. This accumulates playtime hours on your profile without needing the game installed. Supports Steam Guard codes. Credentials go directly to Steam, not to any third party.

### SAM

Steam Achievement Manager is bundled automatically via `npm install` into `sam/SAM.Picker.exe`. From the **Tools** tab you can detect it, download it, browse for it, or launch it with the current App ID pre-loaded for instant achievement unlocking.

---

## Contributing

Pull requests are welcome. Open an issue for bugs, ideas, or questions.

---

## Disclaimer

This tool is for **educational and research purposes only**. It interacts with publicly accessible Steam endpoints and does not bypass authentication or licensing. Paid unowned games will correctly show as unpurchased.
