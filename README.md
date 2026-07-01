# Greed - Steam Manifest & Lua Tool

A simple, educational Steam tool built with Electron and Node.js for generating Lua manifests and managing Steam content.

**⚠️ For Educational & Research Purposes Only**

---

## Features

- Generate Lua manifest files from App ID
- Attempt to download real manifests from Steam CDN
- Auto import to Steam (Lua + appmanifest)
- Restart Steam with one click
- Batch process multiple App IDs
- Decode .manifest files
- Clean and modern UI

---

## How to Use

1. Enter a Steam App ID (example: `480` for Spacewar)
2. Click **"Generate & Download"**
3. Click **"Import to Steam + Restart"**
4. Restart Steam and check your library

---

## Installation

```bash
cd greedytool
npm install
npm start
```

## Project Structure

```
greedytool/
├── main.js
├── preload.js
├── renderer/
│   ├── index.html
│   └── app.js
├── core/
│   ├── cache.js
│   ├── downloader.js
│   ├── exporter.js
│   ├── history.js
│   ├── lua.js
│   ├── manifest.js
│   ├── protobuf.js
│   ├── steamapi.js
│   ├── steamkit.js
│   ├── updater.js
│   ├── utils.js
│   └── ipc/
│       ├── app.js
│       ├── library.js
│       └── steam.js
└── package.json
```
