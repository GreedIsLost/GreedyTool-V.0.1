# Greed - Steam Manifest & Lua Tool

A simple, educational Steam tool built with Electron and Node.js for generating Lua manifests and managing Steam content.

**⚠️ For Educational & Research Purposes Only**

---

## Features

- Generate Lua manifest files from App ID
- Attempt to download real manifests from Steam CDN
- Auto import to Steam (Lua + appmanifest)
- Restart Steam with one click
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
cd greed
npm install
npm start



greed/
├── main.js
├── preload.js
├── renderer/
│   ├── index.html
│   └── app.js
├── core/
│   ├── manifest.js
│   └── lua.js
└── package.json
