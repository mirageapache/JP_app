# 日語學習 PWA

以 iPhone 為主要使用裝置的日語學習 PWA，核心特色是**螢幕手寫練習**，並逐步擴充為涵蓋 N5～N1 的學習工具。個人自用，不商業化。

> **目前狀態**：P1a 平假名自由練習。50 音表、假名詳細（筆順動畫、描摹／空白練習）、手寫調校模式已完成，等待 iPhone 實際使用數天並依筆跡樣本調整門檻。部署於 https://jp-app-ebf.pages.dev/ 。

## 文件

| 文件 | 內容 |
|---|---|
| [japanese-app-project-plan.md](docs/japanese-app-project-plan.md) | 專案規劃書：需求、架構、資料設計、里程碑 |
| [plan-review-questions.md](docs/plan-review-questions.md) | 規劃書 v0.1 審查問題與回答（決策紀錄） |
| [development-phases.md](docs/development-phases.md) | 各開發階段的工作項目清單（P0～P5） |
| [p0-verification.md](docs/p0-verification.md) | P0 iPhone 實機驗證結果與手寫判定分析 |
| [design-system.md](docs/design-system.md) | 設計系統：色彩、字體、元件、手寫練習的視覺規範 |
| [ui-mockups/index.html](docs/ui-mockups/index.html) | 所有頁面的 UI 範例（用瀏覽器開啟） |

## 主要功能

- 50 音：辨識練習、筆順動畫、手寫練習（描摹／提示／空白，逐筆判定）
- 單字、文法學習，以 FSRS 間隔重複排程每日複習
- 測驗、進度統計
- 離線可用；有網路時自動同步到 Firebase，可跨裝置使用
- 匯出／匯入 JSON 作為不依賴雲端的備份

## 技術架構

| 層級 | 選擇 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite |
| PWA | `vite-plugin-pwa` |
| 狀態 | Pinia |
| 本機資料庫 | IndexedDB + Dexie（主要資料庫） |
| 雲端同步 | Firebase Auth + Cloud Firestore |
| SRS | `ts-fsrs` |
| 手寫 | Canvas + Pointer Events，自寫比對引擎 |
| 發音 | Web Speech API |
| 測試 | Vitest、Firebase Emulator（安全規則） |
| 託管 | Cloudflare Pages |
| 內容建置 | Python（`tools/`） |

架構細節見規劃書第 3、4 章。

## 專案結構

```
├─ docs/                # 規劃書、設計系統、UI 範例、開發階段清單
├─ public/
│  ├─ content/strokes/  # KanjiVG 轉出的假名筆畫資料（CC BY-SA 3.0）
│  ├─ icons/            # PWA 圖示
│  └─ _redirects, _headers  # Cloudflare Pages：SPA 回退與快取標頭
├─ src/
│  ├─ app/              # 路由
│  ├─ components/       # AppTopbar、AppTabbar、AppIcon、WritingBox…
│  ├─ core/
│  │  ├─ handwriting/   # 筆畫幾何、逐筆比對、書寫流程、筆畫資料載入
│  │  ├─ sync/          # Firebase 登入、chunk 上傳／下載
│  │  ├─ db/            # Dexie schema
│  │  ├─ debug/         # 錯誤收集、裝置資訊
│  │  ├─ tts/           # 語音合成
│  │  └─ ui/            # useToast 等共用 composable
│  ├─ modules/          # home、settings、p0（驗證頁）；kana、vocab… 於後續階段加入
│  └─ styles/app.css    # 設計 token 與共用樣式
├─ tools/kanjivg/       # KanjiVG → 筆畫 JSON 建置腳本（Python）
├─ firebase/            # Firestore 安全規則、規則測試、部署說明
├─ scripts/             # 開發用工具（iPhone 尺寸截圖）
└─ tests/
```

## 開發

### 需求

- Node.js 22 以上
- Python 3（內容建置腳本，只用標準函式庫）
- Java 11 以上（只有執行 Firestore 安全規則測試時需要）

### 環境變數

複製 `.env.example` 為 `.env.local`，填入 Firebase 專案設定：

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Firebase 的前端設定值本身可以公開，資料安全由 Firestore 安全規則把關；`.env.local` 不納入版本控制只是為了方便切換開發與正式專案。

### 常用指令

```bash
npm install          # 安裝相依套件
npm run dev          # 開發伺服器（--host，區網裝置可連）
npm run build        # 型別檢查 + 建置正式版（含 Service Worker）
npm run preview      # 預覽建置結果
npm run check        # 型別檢查 + ESLint + 單元測試
npm run test         # 單元測試
python tools/kanjivg/build_strokes.py --all-kana   # 重建筆畫資料
node scripts/screenshot.mjs <url> <out.png> [--dark]  # iPhone 尺寸截圖（需本機 Chrome）
```

Firestore 安全規則的部署與測試見 [firebase/README.md](firebase/README.md)。

### 部署到 Cloudflare Pages

1. Cloudflare 儀表板 → Workers & Pages → Create → Pages → 連接 GitHub 的 `JP_app` repo
2. 建置設定：Framework preset 選 **Vite**（或手動填）
   - Build command：`npm run build`
   - Build output directory：`dist`
   - 環境變數：加入 `.env.example` 列出的四個 `VITE_FIREBASE_*`（Production 與 Preview 都要）
3. 部署完成後，把網域（`<project>.pages.dev`）加進 Firebase Auth 的授權網域

`public/_redirects` 讓所有路徑回退到 `index.html`（SPA）；`public/_headers` 設定資產快取。

### iPhone 實機測試

PWA 的 Service Worker 需要 HTTPS，請用 Cloudflare Pages 的網址測試：Safari 開啟 → 分享 → 加入主畫面 → 從主畫面開啟。P0 的驗證項目都在 App 內「設定 → P0 驗證清單」；在「裝置能力與驗證清單」頁勾選結果後按「複製驗證結果」回報。

## 資料來源與授權

本專案使用以下開放資料，內容包為其改作，依各自授權條款釋出：

| 資料 | 用途 | 授權 |
|---|---|---|
| [KanjiVG](https://kanjivg.tagaini.net/)（© Ulrich Apel） | 假名與漢字筆畫 | CC BY-SA 3.0 |
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)（© Electronic Dictionary Research and Development Group） | 單字資料 | CC BY-SA 4.0 |
| [Tatoeba](https://tatoeba.org/) | 例句 | CC BY 2.0 FR |
| Tanos JLPT 清單（Jonathan Waller） | 單字等級 | 待確認 |
| [Klee One](https://fonts.google.com/specimen/Klee+One)（© Fontworks Inc.） | 教科書體字型（假名子集，自帶離線） | SIL Open Font License 1.1 |

App 內「關於」頁面會標示上述來源。
