# GreedyTool — Steam Manifest & Lua Tool

[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)]()
[![Node](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)]()

> **For Educational & Research Purposes Only**

A sleek Electron-powered tool for generating Lua manifests, downloading Steam depot manifests, and managing your Steam library — all wrapped in a clean, modern UI.

---

## Features

| Feature | Description |
|---|---|
| **1-Click Generate** | Enter an App ID to get Lua + ACF manifests instantly |
| **CDN Download** | Attempts real manifest download from Steam's CDN (12 mirrors) |
| **Import to Steam** | Auto-import Lua + appmanifest + restart Steam |
| **Batch Processing** | Queue up multiple App IDs with concurrency control |
| **Manifest Decoder** | Decode `.manifest` files for inspection |
| **SAM Integration** | Detect, download, and launch Steam Achievement Manager |
| **Backup Export** | Package manifests + Lua into a `.zip` |
| **Drag & Drop** | Drop Steam store links or raw App IDs |

---

## Quick Start

```bash
git clone https://github.com/GreedIsLost/GreedyTool-V.0.1.git
cd GreedyTool-V.0.1
npm install
npm start
```

---

## How It Works

```
App ID -> Steam Store API -> Depot Lookup -> CDN Download -> Lua + ACF Generation
                |                                |
                +-- SteamDB Scraping (fallback) --+
                                                  |
                                          +-------+--------+
                                          | Import         | Export .zip
                                          | to Steam       |
                                          +----------------+
```

---

## Project Structure

```
GreedyTool/
+-- main.js              # Electron main process
+-- preload.js           # Context bridge
+-- renderer/            # UI layer
|   +-- index.html
|   +-- app.js
+-- core/                # Business logic
|   +-- cache.js         # Local manifest cache
|   +-- downloader.js    # CDN downloader (12 mirrors)
|   +-- exporter.js      # ZIP backup exporter
|   +-- history.js       # Session history
|   +-- lua.js           # Lua manifest generator
|   +-- manifest.js      # Orchestrator (process-app / process-batch)
|   +-- protobuf.js      # Steam protobuf decoder
|   +-- sam.js           # SAM auto-detect & launcher
|   +-- steamapi.js      # Steam Store API client
|   +-- steamkit.js      # Depot info (API -> SteamDB -> fallback)
|   +-- updater.js       # Self-updater
|   +-- utils.js         # ACF manifest generator
|   +-- ipc/             # IPC handlers
|       +-- app.js       # SAM, file-picker
|       +-- library.js   # Import to Steam
|       +-- steam.js     # Process, search, details
+-- package.json
```

---

## Advanced

### Environment Variables

| Variable | Purpose |
|---|---|
| `NODE_ENV=development` | Auto-open DevTools on launch |

### Concurrency

Batch processing caps at **3 concurrent downloads** by default to avoid rate limits.

### CDN Fallback Chain

```
content-1..8.steampowered.com
cloudflare.steampowered.com
steamstatic.com (with/without .crc suffix)
```

---

## Contributing

PRs welcome! If you find a bug or have an idea, open an issue or submit a pull request.

---

## Disclaimer

This tool is for **educational and research purposes only**. It interacts with publicly accessible Steam CDN endpoints and does not bypass any authentication or licensing checks. Paid unowned games will correctly show "Purchase" — no free game exploits.
