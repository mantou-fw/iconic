iconic 0.2.1 introduces the new name and a signal-path icon for the AV schematic, equipment rack and 3D room editor.

- English, Traditional Chinese and Japanese interface, with a saved language preference under iconic → Language.
- Toolbar descriptions and shortcut hints appear on hover and keyboard focus.
- Node.js / TanStack Start app with Electron desktop packages; the renderer keeps Node integration disabled and context isolation enabled.
- Standalone agent pack bundles the MCP server, av-schematic skill and setup installer for Codex, Claude Code and generic MCP clients.
- Existing project JSON and IndexedDB formats are preserved. The first desktop launch copies the previous profile; the original stays intact.

Downloads:

- `iconic-0.2.1-arm64.dmg`: macOS Apple Silicon.
- `iconic-0.2.1-x64.dmg`: macOS Intel.
- `iconic-0.2.1-x64-Setup.exe`: Windows x64 installer.
- `iconic-agent-pack-0.2.1.zip`: MCP + skill + installer; requires Node.js 22.20+ and npm.
- `iconic-web-0.2.1.zip`: portable Node.js web server; requires Node.js 22.20+.
- `SHA256SUMS.txt`: download checksums.

Desktop installers are unsigned / ad-hoc signed and not notarized. Native signing credentials are not configured. See README for installation, development and MCP/skill setup.

繁體中文：此版本完成 iconic 改名、新圖示、工具列提示，以及英文／繁體中文／日文介面。下載對應平台安裝檔即可使用；AI 控制另下載 Agent pack，按 README 安裝 MCP 與 Skill。

日本語：iconic への名称変更、新しいアイコン、ツールチップ、英語・繁体字中国語・日本語 UI を追加しました。OS に合ったインストーラーをご利用ください。AI 操作にはエージェントパックを導入し、README の MCP・スキル設定手順に従ってください。
