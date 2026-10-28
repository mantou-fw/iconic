iconic 0.3.0 adds independent project databases, saved versions and richer AI imports.

- Each project has its own local Couchbase Lite JavaScript database, with autosave and a project switcher under iconic → Projects and versions.
- Save named versions and restore earlier designs. Restore first backs up the current work and creates a new version; concurrent editors cannot silently overwrite each other.
- Existing IndexedDB drawings are copied into a project once, preserving the original database. JSON imports create separate projects. Snapshots include devices, cables, drawings, room layouts and viewport.
- MCP tools import product models or datasheet-derived specifications as device nodes, and image-derived room descriptions as room layouts, with sources and estimated dimensions retained.
- English, Traditional Chinese and Japanese interface translations are included.

Project databases and version history stay on this device; cloud synchronization is not configured. JSON exports contain the current design, not the complete version history. The bundled Couchbase Lite SDK license is included in desktop and web packages.

Downloads:

- iconic-0.3.0-arm64.dmg: macOS Apple Silicon.
- iconic-0.3.0-x64.dmg: macOS Intel.
- iconic-0.3.0-x64-Setup.exe: Windows x64 installer.
- iconic-agent-pack-0.3.0.zip: MCP + skill + installer; requires Node.js 22.20+ and npm.
- iconic-web-0.3.0.zip: portable Node.js web server; requires Node.js 22.20+.
- SHA256SUMS.txt: download checksums.

Desktop installers are unsigned / ad-hoc signed and not notarized. Native signing credentials are not configured. See README for installation and MCP/skill setup.

繁體中文：每個專案使用獨立 Couchbase Lite 本機資料庫，支援自動儲存、命名版本及還原前備份。舊圖紙會保留並複製到新專案。AI 可透過 MCP 匯入產品型號／datasheet 整理出的設備規格，以及房間圖片分析出的佈局，並保留來源及估算尺寸。目前不包含雲端同步，JSON 匯出不包含完整版本紀錄。

日本語：プロジェクトごとに独立した Couchbase Lite ローカルデータベースを使用し、自動保存、名前付きバージョン、復元前のバックアップに対応しました。既存の図面は保持したまま新しいプロジェクトへコピーします。MCP では製品型番・データシートから整理した機器仕様や、部屋の画像から分析したレイアウトを、出典と推定寸法付きで取り込めます。クラウド同期は含まれず、JSON エクスポートには全バージョン履歴は含まれません。
