# Work-OS

A cross-platform developer workbench for **macOS (Intel + Apple Silicon)** and **Windows**, built with Electron. It is a u-tools / rubick-style launcher: press a global hotkey, search, and open a tool or plugin. The developer toolbox (JSON, WebSocket, crypto) ships as **first-party plugins that run through the exact same runtime as third-party ones** — the plugin system is self-dogfooded from day one.

```
┌─ Work-OS ─────────────────────────────────────┐
│  search:    [ json______________________ ]     │  ← launcher (vibrancy / acrylic)
│            ─────────────────────────────────    │
│            ▸ Format / validate JSON            │
│            ▸ Test a WebSocket connection       │
│            ▸ Hash / encode / decode / encrypt  │
└────────────────────────────────────────────────┘
        select → the plugin renders in its own WebContentsView
```

## Why Electron

This project was scoped with the `native-feel-cross-platform-desktop` skill. Its decision tree rules *out* the heavy four-layer native-shell architecture for this app: "native feel indistinguishable from the OS" is not a hard requirement (u-tools and rubick are themselves Electron apps), and this is a short-runway MVP. **Electron is the correct choice here.** The skill's transferable guidance is still applied: typed IPC (no drift), native windowing conventions, background-throttling disabled, and "make it not feel like a webpage" CSS rules.

## Architecture

```
src/
  main/            Electron main process (ESM)
    index.ts         lifecycle, single-instance, IPC registration
    window/          main launcher window (frameless + vibrancy/acrylic)
                     + native settings window
    plugin/          manager (discover/enable/install), runner (WebContentsView),
                     db (per-plugin KV), handlers (the window.workbench backing)
    hotkey.ts tray.ts store.ts theme.ts
  preload/         CJS preload scripts (sandbox requires CommonJS)
    app.ts           exposes window.api (typed launcher↔main IPC) + window.host
    plugin.ts        exposes window.workbench (the plugin SDK surface)
  renderer/        React + TypeScript launcher + settings UI
    src/views/       Launcher (search + match engine), Settings
    src/features/    match-engine.ts (u-tools-style feature matching)
  shared/
    plugin-kit/     zod manifest schema + WorkbenchApi types + `wb` client
    ipc/api.ts      MainApi / MainEvents contract (single source of truth)
plugins/           built-in plugins (real plugins — same runtime as 3rd-party)
  json-formatter/  websocket-tester/  crypto-tools/
scripts/
  build-plugins.ts  builds every plugin/* into out/plugins/* (Vite, relative base)
  gen-icons.mjs     regenerates plugin logos + the app icon
```

### The plugin contract (modelled on u-tools)

A plugin is a folder with a `plugin.json` manifest, an `index.html` entry, and a built JS/CSS bundle. It runs in **its own `WebContentsView`** (sandboxed, `nodeIntegration:false`, `contextIsolation:true`) and talks to the host **only** through the injected `window.workbench` global — never raw Node/Electron.

```jsonc
// plugin.json
{
  "pluginName": "JSON Formatter",
  "version": "0.1.0",
  "description": "Format, minify and validate JSON.",
  "logo": "logo.png",
  "main": "index.html",
  "features": [
    {
      "code": "json-format",
      "explain": "Format / validate JSON",
      "cmds": ["json", "json格式化", { "type": "regex", "label": "Format JSON", "match": "^\\s*[\\[\\{]" }]
    }
  ],
  "pluginSetting": { "height": 460 }
}
```

`features[].cmds` is the trigger grammar the launcher evaluates against the current input **and the live trigger context** (clipboard image/files + frontmost window):
- **text** — a bare string (exact > substring match)
- **regex** — `{ type:"regex", match, flags?, minLength?, maxLength? }`
- **over** — `{ type:"over", exclude?, minLength?, maxLength? }` (any text)
- **img** — `{ type:"img", label? }` — matches when an image is on the clipboard; the enter payload is the image as a data URL.
- **files** — `{ type:"files", extensions?, match?, minLength?, maxLength? }` — matches files on the clipboard (filters by extension / filename regex); payload is the file-path array.
- **window** — `{ type:"window", match:{ app?[], title? } }` — matches the frontmost app/title; payload is `{ app, title }`.

> macOS note: `window` app-name detection uses AppleScript (System Events); the first run prompts for **Automation** consent in System Settings → Privacy. If denied, window triggers simply don't fire (everything else is unaffected). `img`/`files` need no permission.

### The plugin SDK

```ts
import { wb } from '@wb/plugin-kit'

wb.onPluginEnter((e) => { /* e.code, e.type, e.payload */ })
wb.setExpendHeight(480)
wb.copyText(result)
await wb.db.set('lastUrl', url)      // per-plugin persistent KV
const dark = wb.isDarkColors()
wb.onThemeChange((isDark) => {})
wb.toast('Copied')                   // → OS notification center
```

Full surface: lifecycle (`onPluginEnter/Out/Detach`), layout (`setExpendHeight`), **sub-input** (`setSubInput(cb, placeholder)` / `removeSubInput` / `setSubInputValue`), **detach** (`detachPlugin`), **dynamic features** (`setFeatures`), clipboard, dialogs (`showOpenDialog/Save`), `getPath`, per-plugin `db`, theme, `toast`, `getPlatform`.

- **Sub-input**: `wb.setSubInput((value) => {...}, 'Filter…')` asks the host to render a secondary input in the launcher chrome; the callback fires on every keystroke. Call `wb.removeSubInput()` to hide it.
- **Detach**: `wb.detachPlugin()` (or the launcher's pop-out button) moves the active plugin into its own persistent window; the plugin re-enters (`onPluginEnter`) there. Detached windows survive the launcher being hidden.
- **Dynamic features**: `wb.setFeatures([{ code, explain, cmds }])` replaces this plugin's feature list at runtime (session-only, not persisted) so the launcher can surface state-dependent entries. Payloads are validated against the feature schema; malformed ones are ignored.

The entire `WorkbenchApi` surface is now implemented.

## Prerequisites

- Node.js 20+ and pnpm 9+
- `pnpm install` (the `.npmrc` points Electron + builder-binary downloads at npmmirror for mainland-China networks; remove it if you're elsewhere)

## Development

```bash
pnpm dev          # concurrently: watch-rebuild plugins + electron-vite dev (HMR for the launcher)
pnpm typecheck    # tsc --noEmit for node + web projects
```

Press the global hotkey (default **⌥Space** on macOS, **Alt+Space** on Windows) to toggle the launcher. Type a keyword (`json`, `ws`, `md5`…) and press Enter.

To add a built-in plugin, drop a folder under `plugins/<name>/` with `plugin.json` + `src/` + `index.html`; `pnpm build:plugins` rebuilds it and it appears in the launcher.

## Building installers

```bash
pnpm build              # electron-vite build + build all plugins
pnpm package:mac        # → release/Work-OS-<version>-<arch>.dmg (+ .zip), x64 & arm64
pnpm package:win        # → release/Work-OS Setup <version>.exe (NSIS) + portable, x64
```

**Cross-compiling Windows from macOS:** if you invoke `electron-builder` directly (not via `pnpm run`), the `.npmrc` mirrors are not forwarded. Set them explicitly:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
pnpm exec electron-builder --win nsis --x64
```

**Code signing** is intentionally off in the MVP (it requires an Apple Developer ID / Windows certificate). Unsigned builds work; macOS users right-click → Open on first launch to pass Gatekeeper. Add signing config (`mac.identity`, `win.certificateFile`) when you have credentials.

## Marketplace (remote plugin registry)

Work-OS can install plugins from any static HTTP registry. A registry is a JSON file listing plugin packages:

```jsonc
{
  "name": "Work-OS Marketplace",
  "updated": "2026-08-13T…",
  "plugins": [
    {
      "id": "json-formatter",
      "name": "JSON Formatter",
      "version": "0.1.0",
      "description": "Format, minify and validate JSON.",
      "logo": "plugins/json-formatter.png",     // absolute URL or relative to registry
      "download": "plugins/json-formatter-0.1.0.zip",
      "sha256": "…"                              // optional integrity check
    }
  ]
}
```

Each `download` is a zip of a built plugin (its `plugin.json`, `index.html`, `assets/`, `logo.png`). On install, the host downloads the zip, verifies `sha256` if present, extracts into `userData/plugins/<name>@<version>`, validates the manifest, and re-scans — the new plugin appears in the launcher immediately. Uninstall and update (newer version) are supported from the **Settings → Marketplace** tab.

### Publishing your own marketplace

The repo can serve as its own registry:

```bash
pnpm build:marketplace      # builds plugins, zips each, writes marketplace/registry.json + marketplace/plugins/*
```

Then host the `marketplace/` folder anywhere static (GitHub raw, jsDelivr, S3, or a local server). In the app: **Settings → Marketplace → paste the registry URL → Save → Load → Install**.

For local testing:

```bash
node -e "require('http').createServer((q,s)=>{const f='marketplace'+(q.url==='/'?'/registry.json':q.url);require('fs').existsSync(f)?s.end(require('fs').readFileSync(f)):(s.statusCode=404,s.end())}).listen(8080)"
# registry URL → http://localhost:8080/registry.json
```

The marketplace install mechanics (fetch → sha256 → extract → validate) are covered by `node scripts/smoke-marketplace.mjs`.

### Signing the registry (author verification)

`sha256` proves a downloaded zip matches the registry, but a tampered registry could list its own hashes. To prove authorship, the registry operator signs it with an **Ed25519** key (Node built-in crypto — no external deps; Sigstore/cosign is the same model and could replace this layer).

```bash
pnpm keygen                                                       # → base64 public + private key
WORKOS_SIGNING_KEY_ID=work-os \
WORKOS_SIGNING_KEY=<base64 private key> pnpm sign:registry        # writes signature + keyId into registry.json
```

The signature covers a canonical message (`name`, `updated`, and each plugin's `id|version|sha256`). On load, the host:

1. verifies the signature against a **locally-pinned** trusted public key (the trust anchor — a MITM can't change it), and
2. rejects forged/tampered registries or unknown keys.

Pin the operator's public key under **Settings → Marketplace → Signature Trust**, and optionally toggle **Require signed registry**. The signing/verification logic is covered by `pnpm smoke:sign` (valid ✓, tamper-rejected ✓, unknown-key-rejected ✓, plus a round-trip of the real registry).

## Auto-update

Work-OS checks an update feed (electron-updater) on launch and on demand. Configure the feed URL under **Settings → Updates**; the host fetches `latest.yml` / `latest-mac.yml` (emitted by `electron-builder`, see `publish` in `electron-builder.yml`), downloads newer versions in the background, and installs on restart.

```bash
pnpm package:mac            # also emits release/latest-mac.yml (+ per-arch)
pnpm package:win            # also emits release/latest.yml
# host the release/ directory at some URL, then point Settings → Updates at it
```

- **macOS**: *applying* an update requires the build to be code-signed/notarized (Squirrel.Mac verifies the replacement). **Detection and download work unsigned.** This is the one feature still gated on the deferred signing work.
- **Windows (NSIS)**: works unsigned (the user sees an "unknown publisher" prompt on install).

The updater is loaded **lazily** so a failure to import `electron-updater` can never crash the main process, and all status changes are broadcast to the launcher. The feed-reading integration is verified by `pnpm smoke:update` (packages the app, serves a local feed, and confirms the packaged app fetches `latest-mac.yml` and reports `update-not-available`). Debug with `WORKOS_UPDATER_DEBUG=1`.

## Code signing & notarization (macOS)

Builds are **unsigned by default** — no certificate is needed for local dev, and the `afterSign` hook is a no-op without credentials. When you have an **Apple Developer ID**, signing + notarization + stapling is one environment block away:

```bash
export CSC_LINK="/path/to/Developer-ID-Application.p12"   # or a URL to it
export CSC_KEY_PASSWORD="<p12 password>"
export APPLE_ID="<your-apple-id@email>"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific password from appleid.apple.com>"
export APPLE_TEAM_ID="<10-char team id>"

pnpm package:mac   # → signed, notarized, stapled dmgs (x64 + arm64)
```

How it's wired:
- `electron-builder.yml` omits `mac.identity` on purpose → electron-builder signs automatically when `CSC_LINK`/`CSC_KEY_PASSWORD` are set, and builds unsigned otherwise. Hardened-runtime entitlements live in `build/entitlements.mac.plist`.
- `scripts/notarize.cjs` is the `afterSign` hook. It notarizes with `notarytool` and staples the ticket **only when** `CSC_LINK` + the three `APPLE_*` vars are present; otherwise it logs and skips, so local unsigned builds are unaffected.

Once you're signing, macOS **auto-update apply** (the one step currently gated) also starts working — Squirrel.Mac will accept the signed replacement. Detection/download already work unsigned.

> Windows signing is a separate, simpler step: set `CSC_LINK`/`CSC_KEY_PASSWORD` to an EV/standard code-signing cert (no notarization concept). Unsigned Windows builds work with an "unknown publisher" prompt.

## Built-in tools

| Plugin | Triggers | Capabilities |
|---|---|---|
| **JSON Formatter** | `json`, `json格式化`, regex on `{`/`[` | beautify / minify / validate, copy |
| **WebSocket Tester** | `websocket`, `ws` | connect/disconnect, send, timestamped in/out log |
| **Crypto Tools** | `crypto`, `md5`, `base64`, `jwt`, `aes`, … | MD5/SHA hashes, Base64, URL, AES (passphrase), JWT decode |

## MVP scope (and what's deferred)

In scope: plugin discovery + local-folder install **and a remote marketplace** (registry fetch, zip download with sha256 verification, **Ed25519 registry signing with pinned-key verification**, install/update/uninstall), **auto-update** (electron-updater feed check + download + install-on-restart; macOS apply pending signing), the SDK, the three dev tools as real plugins, mac (Intel + ARM) + Windows packaging.

Intentionally deferred: per-plugin (per-author) signatures (the registry signature already covers every plugin's id/version/sha256), **macOS update application** (needs Apple notarization — the remaining code-signing work; detection/download work unsigned), true per-plugin HMR, untrusted-third-party sandbox hardening, and Linux.
