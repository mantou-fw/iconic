# iconic

[English](README.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md)

<img src="public/icon.svg" width="88" alt="iconic 圖示" />

用於繪製 AV 訊號流程圖、設備機櫃與 3D 房間佈局的編輯器。採用 **TanStack Start、React 19 與 Node.js**，透過 **Electron** 提供 macOS 及 Windows 桌面版本。

支援**英文、繁體中文及日文**。在 **iconic → 語言** 選擇介面語言，設定會儲存在本機。將滑鼠停留在工具列按鈕上，或以鍵盤移至按鈕，即可查看工具說明與快捷鍵。

## 下載與安裝

從 [GitHub Releases](https://github.com/mantou-fw/iconic/releases/latest) 下載：

| 檔案 | 用途 |
| --- | --- |
| `iconic-0.3.0-arm64.dmg` | macOS Apple Silicon：開啟 DMG，將 iconic 拖至「應用程式」 |
| `iconic-0.3.0-x64.dmg` | macOS Intel：開啟 DMG，將 iconic 拖至「應用程式」 |
| `iconic-0.3.0-x64-Setup.exe` | Windows x64：執行安裝程式 |
| `iconic-web-0.3.0.zip` | 可攜式網頁伺服器，需要 Node.js 22.20 以上版本 |
| `iconic-agent-pack-0.3.0.zip` | 提供 AI 用戶端使用的 MCP 伺服器、Skill 與安裝器 |
| `SHA256SUMS.txt` | 下載檔案的 SHA-256 校驗值 |

桌面版已內含 Node 執行環境。**只有網頁伺服器或 MCP Agent pack 需要另外安裝 Node.js。** 目前安裝檔未正式簽署，macOS 版本使用臨時簽署，尚未完成公證。如果 macOS 阻擋開啟下載的 app，可在「系統設定 → 隱私權與安全性 → 強制打開」檢視並允許開啟。

使用可攜式網頁版本時，先解壓縮，再於該資料夾執行：

```sh
NITRO_HOST=127.0.0.1 NITRO_PORT=4321 npm start
```

PowerShell：

```powershell
$env:NITRO_HOST="127.0.0.1"
$env:NITRO_PORT="4321"
npm start
```

開啟 [localhost:4321](http://localhost:4321)。控制伺服器應只監聽本機 loopback 位址。

## 安裝 MCP 與 Skill

1. 開啟 iconic，並保持一份圖紙開啟。
2. 選擇 **iconic → AI 使用說明**。
3. 選擇 Codex、Claude Code 或其他 MCP 用戶端，下載 **Agent pack**。亦可從 Releases 下載。
4. 將 ZIP 解壓縮至永久保留的資料夾。安裝 **Node.js 22.20 以上版本**及 npm。Pack 已包含 MCP 依賴，無需在 pack 內執行 `npm install`。
5. 在解壓縮後的 `iconic-agent-pack` 資料夾開啟終端機，執行適合的指令：

```sh
# 先預覽設定變更
node scripts/setup-agent.mjs --agent codex --with-skill --dry-run

# Codex：註冊 MCP 並安裝 Skill
node scripts/setup-agent.mjs --agent codex --with-skill

# Claude Code：註冊 MCP 並安裝 Skill
node scripts/setup-agent.mjs --agent claude-code --with-skill

# 其他用戶端：輸出設定，不修改現有設定
node scripts/setup-agent.mjs --agent generic
```

安裝器會將 MCP 註冊寫入所選用戶端的**使用者層級設定**。`--with-skill` 使用 Vercel skills CLI 1.7.4 安裝，需要網絡連線。完成後請重新載入 AI 用戶端。MCP 使用 pack 的絕對路徑，因此請保留原有資料夾位置。如使用其他 app 連接埠，可加入 `--url http://localhost:8080`。安裝器會保留指向其他位置的現有註冊，除非你明確加入 `--replace`。

最後的連線檢查只會讀取畫布。退出碼 **2** 表示設定已儲存，但尚未驗證 app 連線。保持 app 開啟後重試：

```sh
node scripts/mcp-check.mjs
# macOS／Linux 使用其他連接埠：
AV_CANVAS_URL=http://localhost:8080 node scripts/mcp-check.mjs
```

如只需直接從此 repository 安裝 Skill：

```sh
npx skills@1.7.4 add https://github.com/mantou-fw/iconic --skill av-schematic -a codex -a claude-code -g --copy
```

**單獨安裝 Skill 不會註冊 MCP。** 如在 pack 或原始碼專案內安裝本機 Skill，可將 GitHub 網址改為 `.`。其他用戶端需要使用該用戶端支援的 skills agent ID。

從原始碼專案手動註冊 MCP（先執行 `npm ci`）：

```sh
codex mcp add av-schematic -- node /absolute/path/to/iconic/mcp/server.mjs
```

通用 MCP 設定（請替換為實際絕對路徑）：

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

向 Codex 提出要求：**「使用 $av-schematic，先讀取現有畫布，再加入一套會議室 AV 系統，保留原有內容。」**

MCP 伺服器提供 17 個工具，用於設備、分區、接線、機櫃、自動排版及 3D 房間。編輯前先讀取畫布，只有在明確要求時才清空或刪除內容。JSON 及 PNG／SVG／PDF／HTML／XLSX 匯出由 app 手動操作。詳見 [MCP 設定](doc/mcp-integration.md)、[Agent 發佈說明](doc/agent-distribution.md)及 [Skill](.agents/skills/av-schematic/SKILL.md)。

將完整產品型號或 datasheet 交給 AI，即可透過 `import_product` 建立含已確認連接埠及來源的設備節點。將房間照片或平面圖交給支援圖片辨識的 AI，即可透過 `import_room_layout` 產生 3D 佈局；可附上已知尺寸，否則會明確標示估算及假設。查閱資料及圖片辨識由 AI 用戶端負責。預設保留現有內容，JSON 專案會儲存房間、來源及比例假設。詳見[匯入流程](.agents/skills/av-schematic/references/imports.md)。

## 專案與版本紀錄

選擇 **iconic → 專案與版本**，即可新增或切換專案。每個專案使用獨立的 Couchbase Lite JavaScript 資料庫，編輯時自動儲存至本機。輸入版本名稱即可保留完整快照；還原時會先備份目前內容，再建立新版本。快照包含圖紙、圖片、接線、3D 房間、設定及視角。

首次啟動會將舊 IndexedDB 圖紙複製成「原有圖紙」專案，保留原本資料庫。開啟 JSON 檔案會建立獨立專案；JSON 匯出格式維持相容，版本紀錄留在本機資料庫。儲存空間依瀏覽器／Electron 使用者設定及來源位址區分，未設定雲端同步。官方 JavaScript SDK 底層使用 IndexedDB，依 Couchbase 授權條款提供；建置版本保留 `licenses/couchbase-lite.txt`。詳見[儲存架構](doc/project-storage.md)。

## 開發

需要 Node.js 22.20 以上版本及 npm。開發、測試與建置均使用 Node.js 和 npm。

```sh
git clone https://github.com/mantou-fw/iconic.git
cd iconic
npm ci
npm run dev                 # http://localhost:4321
npm run desktop:dev         # Electron + TanStack Start
npm run typecheck
npm test
```

可用 `PORT` 指定其他開發連接埠。瀏覽器、桌面開發版與正式桌面版使用獨立的 IndexedDB 儲存空間，可透過專案 JSON 匯入／匯出轉移圖紙。iconic 桌面版首次啟動時會複製舊版 app 的資料一次，並保留原始資料。資料庫名稱（`av-schematic-db`）及 JSON 格式（`av-schematic`）保持相容。

## 建置與發佈

```sh
npm run build                    # TanStack Start + Nitro Node 伺服器
npm start                        # 執行 .output/server/index.mjs
npm run desktop:pack             # 未封裝成安裝檔的 Electron app
npm run desktop:build:mac        # Apple Silicon + Intel DMG，需要 macOS
npm run desktop:build:windows    # Windows x64 安裝程式
npm run agents:pack              # 獨立 MCP／Skill ZIP
npm run release:web              # 可攜式 Node 伺服器 ZIP，先執行 npm run build
npm run icons:build              # 從 SVG 產生 PNG／ICO，macOS 亦產生 ICNS
```

輸出位於 `release/`。`npm run build` 與桌面建置亦會更新 app 內的 `/downloads/iconic-agent-pack.zip` 下載檔案。

[Release 工作流程](.github/workflows/release.yml)會在原生 macOS 及 Windows runner 執行測試與建置。推送 `v*` tag 會發佈 DMG、EXE、Agent pack、網頁版本 ZIP 及 SHA-256 校驗值。在 `main` 手動執行 workflow 會產生可下載的 Actions artifacts，不會建立 release。原生 Windows 建置會寫入執行檔圖示與 metadata；在 macOS 跨平台建置時可產生安裝程式，但缺少 Windows 工具時會略過 PE 資源編輯。如需發佈已正式簽署的版本，請另外設定簽署與 macOS 公證。

發佈新版本時，先更新套件版本，再建立對應的新 tag（請替換下方的 `X.Y.Z`）：

```sh
git tag vX.Y.Z
git push origin main refs/tags/vX.Y.Z
```

## 架構

```text
AI 用戶端 → Node MCP stdio（mcp/server.mjs）
                    ↓ fetch
           TanStack Start /api/canvas
                    ↕ 指令 ID／回覆
           React Flow + Three.js（Electron 或瀏覽器）
```

- `src/routes/`、`src/router.tsx`、`src/server.ts`：路由、HTML 文件與正式環境 CSP nonce。
- `src/server/canvas-broker.mjs`：目前畫布的連線租約、指令與回覆配對、逾時及到期處理。
- `src/server/canvas-handler.ts`：檢查 loopback Host 與瀏覽器 Origin。
- `src/lib/ai-bridge.ts`：renderer 端驗證、輪詢，以及 React 更新完成後的回覆。
- `src/lib/i18n.ts`、`src/locales/`：語言設定與翻譯字典。每個翻譯 key 都須加入三份 JSON；使用者撰寫的圖紙內容不會被翻譯。
- `desktop/`：隔離的 Electron renderer 與本機伺服器生命週期。Node integration 保持停用，context isolation 與 sandbox 保持啟用。
- `.agents/skills/av-schematic/`：可攜式的標準 Skill，包含使用相對路徑的設定及工具參考文件。

編輯器支援 AV 設備、分區、機櫃、圖紙標題欄、文字、便箋、形狀、圖片、畫筆、接線路由、圖例、3D 物件放置，以及專案／圖片／PDF／HTML／XLSX 匯出。詳見[畫布指南](doc/canvas-guide.md)及[更新記錄](CHANGELOG.md)。
