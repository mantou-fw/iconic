# iconic

[English](README.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md)

<img src="public/icon.svg" width="88" alt="iconic icon" />

AV signal-flow diagrams, equipment racks and 3D room layouts. Built with **TanStack Start, React 19 and Node.js**, packaged with **Electron** for macOS and Windows.

**English, Traditional Chinese and Japanese** — choose **iconic → Language**. The language preference is saved locally. Hover or focus toolbar buttons to see descriptions and keyboard shortcuts.

## Download and install

Download from [GitHub Releases](https://github.com/mantou-fw/iconic/releases/latest):

| File | Use |
| --- | --- |
| `iconic-0.2.2-arm64.dmg` | macOS Apple Silicon: open the DMG and drag iconic to Applications |
| `iconic-0.2.2-x64.dmg` | macOS Intel: open the DMG and drag iconic to Applications |
| `iconic-0.2.2-x64-Setup.exe` | Windows x64: run the installer |
| `iconic-web-0.2.2.zip` | Portable web server; Node.js 22.20+ required |
| `iconic-agent-pack-0.2.2.zip` | MCP server, skill and installer for an AI client |
| `SHA256SUMS.txt` | SHA-256 checksums for the release downloads |

The desktop app bundles its Node runtime. **Node.js is only required separately for the web server or MCP agent pack.** The current installers are unsigned/ad-hoc signed and macOS is not notarized. If macOS blocks opening the downloaded app, review it in System Settings → Privacy & Security → Open Anyway.

For the portable web archive, extract it and run inside its folder:

```sh
NITRO_HOST=127.0.0.1 NITRO_PORT=4321 npm start
```

PowerShell:

```powershell
$env:NITRO_HOST="127.0.0.1"
$env:NITRO_PORT="4321"
npm start
```

Open [localhost:4321](http://localhost:4321). Keep the control server on loopback.

## Install MCP and the skill

1. Open iconic and keep a drawing open.
2. Choose **iconic → AI guide**.
3. Select Codex, Claude Code or another MCP client and download the **Agent pack**. You can also download it from Releases.
4. Extract the ZIP to a permanent folder. Install Node.js **22.20+** and npm. The MCP dependencies are bundled; no `npm install` is needed in the pack.
5. Open a terminal in the extracted `iconic-agent-pack` folder and run the appropriate command:

```sh
# Preview settings changes first
node scripts/setup-agent.mjs --agent codex --with-skill --dry-run

# Codex: register MCP and install the skill
node scripts/setup-agent.mjs --agent codex --with-skill

# Claude Code: register MCP and install the skill
node scripts/setup-agent.mjs --agent claude-code --with-skill

# Another client: print configuration without modifying settings
node scripts/setup-agent.mjs --agent generic
```

The installer writes the selected client's **user-level** MCP registration. `--with-skill` installs via Vercel skills CLI 1.7.4 and needs internet access. Reload the AI client afterward. Keep the pack in the same folder because MCP uses its absolute path. Use `--url http://localhost:8080` for a different app port. Existing registrations pointing elsewhere are preserved unless you explicitly add `--replace`.

The final connection check is read-only. Exit code **2** means settings were saved but the app connection is not verified. Keep the app open and retry:

```sh
node scripts/mcp-check.mjs
# Different port on macOS/Linux:
AV_CANVAS_URL=http://localhost:8080 node scripts/mcp-check.mjs
```

To install only the skill directly from this repository:

```sh
npx skills@1.7.4 add https://github.com/mantou-fw/iconic --skill av-schematic -a codex -a claude-code -g --copy
```

**Installing the skill alone does not register MCP.** In the pack or source checkout, replace the GitHub URL with `.` to install the local skill. Other clients need their supported skills agent ID.

Manual MCP registration from a source checkout (after `npm ci`):

```sh
codex mcp add av-schematic -- node /absolute/path/to/iconic/mcp/server.mjs
```

Generic MCP configuration (use your actual absolute path):

```json
{
  "mcpServers": {
    "av-schematic": {
      "command": "node",
      "args": ["/absolute/path/to/iconic-agent-pack/mcp/server.mjs"],
      "env": { "AV_CANVAS_URL": "http://localhost:4321" }
    }
  }
}
```

Ask Codex: **“Use $av-schematic. Read the current canvas, then add a meeting-room AV system while preserving existing content.”**

The MCP server exposes 15 tools for devices, zones, cables, racks, layouts and 3D rooms. Read the canvas before editing; clear or delete only when requested. JSON and PNG/SVG/PDF/HTML/XLSX exports are manual app features. See [MCP setup](doc/mcp-integration.md), [agent distribution](doc/agent-distribution.md) and the [skill](.agents/skills/av-schematic/SKILL.md).

## Development

Requires Node.js 22.20+ and npm. Use Node.js and npm throughout.

```sh
git clone https://github.com/mantou-fw/iconic.git
cd iconic
npm ci
npm run dev                 # http://localhost:4321
npm run desktop:dev         # Electron + TanStack Start
npm run typecheck
npm test
```

Use `PORT` for another development port. Browser, desktop development and packaged profiles have separate IndexedDB storage. Project JSON import/export transfers drawings. The first iconic desktop launch copies the previous app profile once, retaining the original. The database name (`av-schematic-db`) and JSON format (`av-schematic`) stay compatible.

## Build and release

```sh
npm run build                    # TanStack Start + Nitro Node server
npm start                        # Serve .output/server/index.mjs
npm run desktop:pack             # Unpacked Electron app
npm run desktop:build:mac        # Apple Silicon + Intel DMGs; requires macOS
npm run desktop:build:windows    # Windows x64 installer
npm run agents:pack              # Standalone MCP/skill ZIP
npm run release:web              # Portable Node server ZIP, after npm run build
npm run icons:build              # Render SVG to PNG/ICO; also ICNS on macOS
```

Artifacts are written under `release/`. `npm run build` and desktop builds also refresh the in-app `/downloads/iconic-agent-pack.zip` download.

The [release workflow](.github/workflows/release.yml) tests and builds on native macOS and Windows runners. Pushing a `v*` tag publishes DMGs, EXE, agent pack, web archive and SHA-256 checksums. Manual workflow dispatch on `main` builds downloadable Actions artifacts without creating a release. Native Windows builds include executable icon metadata; cross builds from macOS can create an installer but skip PE resource editing without Windows tools. Configure signing/notarization separately before distributing signed builds.

For a new release, update the package versions first, then use a new matching tag (replace `X.Y.Z` below):

```sh
git tag vX.Y.Z
git push origin main refs/tags/vX.Y.Z
```

## Architecture

```text
AI client → Node MCP stdio (mcp/server.mjs)
                    ↓ fetch
           TanStack Start /api/canvas
                    ↕ command ID / reply
           React Flow + Three.js (Electron or browser)
```

- `src/routes/`, `src/router.tsx`, `src/server.ts`: routes, document and production CSP nonces.
- `src/server/canvas-broker.mjs`: active drawing lease, correlated commands, timeouts and expiry.
- `src/server/canvas-handler.ts`: loopback Host and browser Origin checks.
- `src/lib/ai-bridge.ts`: renderer validation, polling and responses after React commits.
- `src/lib/i18n.ts`, `src/locales/`: language preference and translation catalogs. Add each translation key to all three JSON files; user-authored drawing content is never translated.
- `desktop/`: isolated Electron renderer and local server lifecycle. Node integration is disabled, context isolation and sandboxing stay enabled.
- `.agents/skills/av-schematic/`: portable canonical skill, with relative setup and tool references.

The editor includes AV devices, zones, racks, title blocks, text, memos, shapes, images, pen strokes, cable routing, legends, 3D placement and project/image/PDF/HTML/XLSX exports. See the [canvas guide](doc/canvas-guide.md) and [changelog](CHANGELOG.md).
