# 日語學習 PWA

以 iPhone 為主要使用裝置的日語學習 PWA，核心特色是**螢幕手寫練習**，並逐步擴充為涵蓋 N5～N1 的學習工具。個人與家人自用，不商業化。

> **目前狀態**：規劃階段（規劃書 v0.3），尚未開始實作。下一步為 P0 驗證。

## 文件

| 文件 | 內容 |
|---|---|
| [japanese-app-project-plan.md](japanese-app-project-plan.md) | 專案規劃書：需求、架構、資料設計、里程碑 |
| [plan-review-questions.md](plan-review-questions.md) | 規劃書 v0.1 審查問題與回答（決策紀錄） |

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

## 專案結構（規劃）

```
├─ public/content/      # 內容包（靜態 JSON）
├─ src/
│  ├─ modules/          # kana、vocab、grammar、quiz、stats、settings、onboarding
│  ├─ core/             # srs、handwriting、tts、db、sync
│  ├─ components/
│  └─ stores/
├─ tools/               # Python 內容建置腳本
├─ firebase/            # Firestore 安全規則與測試
└─ tests/
```

## 開發

> 以下為預計的開發流程，專案建立後再依實際內容更新。

### 需求

- Node.js（LTS）
- Python 3（內容建置腳本）
- Firebase CLI（安全規則測試與部署）

### 環境變數

複製 `.env.example` 為 `.env.local`，填入 Firebase 專案設定：

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Firebase 的前端設定值本身可以公開，資料安全由 Firestore 安全規則把關；`.env.local` 不納入版本控制只是為了方便切換開發與正式專案。

### 常用指令（預計）

```bash
npm install          # 安裝相依套件
npm run dev          # 開發伺服器
npm run build        # 建置正式版
npm run test         # 單元測試
```

### iPhone 實機測試

PWA 的 Service Worker 需要 HTTPS。實機測試時，透過 Cloudflare Pages 的預覽部署，或使用 HTTPS 通道工具連到開發機，再於 Safari 選「加入主畫面」。

## 資料來源與授權

本專案使用以下開放資料，內容包為其改作，依各自授權條款釋出：

| 資料 | 用途 | 授權 |
|---|---|---|
| [KanjiVG](https://kanjivg.tagaini.net/)（© Ulrich Apel） | 假名與漢字筆畫 | CC BY-SA 3.0 |
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)（© Electronic Dictionary Research and Development Group） | 單字資料 | CC BY-SA 4.0 |
| [Tatoeba](https://tatoeba.org/) | 例句 | CC BY 2.0 FR |
| Tanos JLPT 清單（Jonathan Waller） | 單字等級 | 待確認 |

App 內「關於」頁面會標示上述來源。
