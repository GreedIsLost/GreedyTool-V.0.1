# GREEDYTOOL

```
  _____ _____  ______ _____   ____  _   _ _____  _   _
 / ____|  __ \|  ____|  __ \ / __ \| \ | |  __ \| \ | |
| |  __| |__) | |__  | |__) | |  | |  \| | |  | |  \| |
| | |_ |  _  /|  __| |  ___/| |  | | . ` | |  | | . ` |
| |__| | | \ \| |____| |    | |__| | |\  | |__| | |\  |
 \_____|_|  \_\______|_|     \____/|_| \_|_____/|_| \_|
```

> **For Educational & Research Purposes Only**

[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)]()
[![Node](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)]()

**GreedyTool** generates Steam Lua + ACF manifests, downloads depot manifests from the CDN, and bundles SAM for achievement management — all from a slick Electron desktop app.

---

## Features

| | |
|---|---|
| **Instant Generation** | Enter an App ID, get Lua + ACF manifests in one click |
| **CDN Download** | 12-mirror fallback chain for real depot manifests |
| **Import + Restart** | Injects manifests into Steam and restarts it automatically |
| **Batch Processing** | Queue up multiple App IDs with concurrency control |
| **Manifest Decoder** | Inspect `.manifest` binary files in a readable format |
| **SAM Integration** | Bundled via `npm install` — unlock achievements from the app |
| **Backup Export** | Package everything into a `.zip` archive |
| **Drag & Drop** | Drop Steam store links or raw App IDs |

---

## Quick Start

```bash
git clone https://github.com/GreedIsLost/GreedyTool-V.0.1.git
cd GreedyTool-V.0.1
npm install    # also downloads SAM.Picker.exe
npm start
```

---

## Pipeline

```
App ID
  |
  v
Steam Store API  -----> Depot Lookup
  |                          |
  |    (fallback)            |
  +--> SteamDB Scraping -----+
  |
  v
CDN Download (12 mirrors)
  |
  v
Lua + ACF Generation ---> Import to Steam
  |                          |
  |                          v
  +--> Export .zip        Restart Steam
  |
  +--> Launch SAM (unlock achievements)
```

---

## Project Structure

```
GreedyTool/
+-- main.js                    Electron main process
+-- preload.js                 Context bridge (IPC API)
+-- renderer/
|   +-- index.html
|   +-- app.js
+-- core/
|   +-- cache.js               Local manifest cache
|   +-- downloader.js          CDN downloader (12 mirrors, redirect-aware)
|   +-- exporter.js            ZIP backup exporter
|   +-- history.js             Session and settings persistence
|   +-- lua.js                 Lua manifest generator
|   +-- manifest.js            Processing pipeline orchestrator
|   +-- protobuf.js            Steam protobuf decoder
|   +-- sam.js                 SAM detection, launching, download
|   +-- setup-sam.js           Postinstall script to bundle SAM
|   +-- steamapi.js            Steam Store API client
|   +-- steamkit.js            Depot info (API -> SteamDB -> fallback)
|   +-- updater.js             Self-updater
|   +-- utils.js               ACF manifest generator
|   +-- ipc/
|       +-- app.js             SAM, file picker, cache, settings
|       +-- library.js         Import to Steam logic
|       +-- steam.js           Process, search, app details
+-- sam/
|   +-- SAM.Picker.exe         (downloaded by postinstall)
+-- package.json
```

---

## Advanced

### Environment Variables

| Variable | Effect |
|---|---|
| `NODE_ENV=development` | Auto-open DevTools on launch |

### Concurrency

Batch processing runs **3 concurrent downloads** by default to stay under rate limits.

### CDN Fallback Chain

```
content-1.steampowered.com
  -> content-8.steampowered.com
    -> cloudflare.steampowered.com
      -> steamstatic.com (with .crc)
        -> steamstatic.com (without .crc)
```

### SAM

Steam Achievement Manager is downloaded automatically during `npm install` into `sam/SAM.Picker.exe`. From the app's Tools tab you can detect it, download it, browse for it, or launch it with the current App ID pre-loaded.

---

## Contributing

Pull requests are welcome. Open an issue for bugs, ideas, or questions.

---

## Disclaimer

This tool is for **educational and research purposes only**. It interacts with publicly accessible Steam endpoints and does not bypass authentication or licensing. Paid unowned games will correctly show as unpurchased — no exploits.
