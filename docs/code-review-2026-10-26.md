# 完整 Code Review（P1.5 完成時點，2026-10-26）

> 範圍：`src/` 全部（約 7,800 行）、`tests/`、`firebase/`、`vite.config.ts`、`docs/*.md`。
> 方法：四個獨立審查（架構／資料正確性／規格對照／前端與 PWA）平行進行、互不共用脈絡，再由主線彙整；標 ✅ 的項目已另行核對程式碼確認。
> 本文件只記錄發現與建議，**未修改任何程式碼**；要修哪些由使用者決定（見 §7）。

## 0. 總結

- 核心分層健康：`core/` 不依賴 `modules/`、`components/`；FSRS 重放、sync engine（transport 注入）、backup 皆可測且有測試；iOS PWA 基礎（safe-area、dvh、touch-action、coalesced events、TTS 解鎖、lazy routes）做得紮實。
- 必修的 bug 與資料風險共 **8 項**（§1），多數集中在同步的「中斷後能否自我修復」。
- 直接開 P2 可行，但有 **3 個結構問題**（§2 A1–A3）會讓單字卡（新 item type、3 技能）變成同時改 8～10 個檔；建議先整理。
- 規格對照找到 **2 個使用者可感知的落差**（標記已會無法恢復；拗音／小寫不能批次標記）與多個「有開關、沒讀者」。
- 文件之間對 write 卡解鎖規則有三種說法，P1.5 狀態互相矛盾。

---

## 1. 必修：bug 與資料風險

| # | 嚴重度 | 位置 | 問題 | 修法 |
|---|---|---|---|---|
| B1 ✅ | High | `src/core/sync/engine.ts` pull | `mergeChunk` 逐份 chunk 各自 commit，`rebuildCards(affected)` 在整個迴圈之後才跑。若中途被 iOS 殺掉或 rebuild 擲錯，下次重抓會被 uuid 去重擋掉 → `affected` 為空 → **cards 永遠不重建**，排程與紀錄不一致；目前沒有手動修復入口 | 在 `mergeChunk` 同一交易內把受影響 cardId 寫進 `syncMeta.dirtyCardIds`，`sync()` 開頭先消化；除錯頁加「重建所有卡片」按鈕 |
| B2 | High | `engine.ts` push / `takeBatch` | chunk 只以筆數（400）切，不看位元組。手寫紀錄每筆 2～3 KB，400 筆可能超過 Firestore 1 MiB；而且重試永遠是同一批 → **之後所有紀錄都傳不出去** | 以 `JSON.stringify` 估算（上限約 700 KB）超過就對半切；手寫紀錄另開 chunk，不拖住 reviewLogs |
| B3 ✅ | High | `src/modules/settings/CalibrationPage.vue:148-158` | `<template>` 中間殘留一段 `<style scoped>`（與檔尾 203 行那段相同）。Vue 編譯會忽略並警告，lint／typecheck 都抓不到 | 刪除 148–158 行 |
| B4 ✅ | High | `src/modules/p0/P0FirebasePage.vue:104,114` | P0 原型頁仍在正式路由，`makeChunk()` 會把 `paramsVersion: 'p0-test'` 的**假 reviewLog 上傳到登入帳號**，其他裝置下載後會當真評分；還有自己的 localStorage 佇列繞過 sync engine | 刪除 P0FirebasePage／P0HandwritingPage／P0IndexPage（功能已被 AccountPage／CalibrationPage 取代）；P0DevicePage 的裝置資訊併入 DebugPage |
| B5 ✅ | High | `src/components/WritingBox.vue:116-150` | `onMove`／`onUp` 不比對 `pointerId`。Apple Pencil 書寫時手掌的 pointerup 會提前結束那一筆 → 誤判「連筆／形狀不像」。`setPointerCapture` 無 try/catch、無 `lostpointercapture` → capture 遺失後 `current` 永不歸零，畫布從此不收筆 | `current` 記錄 `pointerId`，三個 handler 比對；`onDown` 加 `isPrimary` 檢查；監聽 `lostpointercapture` |
| B6 ✅ | High | `src/styles/app.css:485-487` + `WritingBox.vue` hint | `prefers-reduced-motion` 全域 `animation: none`，而提示筆畫靠 `stroke-dashoffset` 動畫才會顯示 → 開啟減少動態的使用者連錯 3 次後只看到一個藍點 | reduced-motion 下對 `.hint path` 設 `stroke-dashoffset: 0`；全域規則只針對裝飾性動畫 |
| B7 ✅ | High | `src/core/settings/index.ts:66` + `src/app/router.ts:32` | `loadSettings` 無 try/catch，router guard await 它；Dexie 開啟失敗（隱私模式、儲存被清）→ **整個 App 空白、無訊息** | `loadSettings` catch 後以預設值繼續並記錄；`router.onError` 顯示「無法開啟本機資料庫」頁 |
| B8 ✅ | Medium | `src/core/srs/useDailySession.ts:43-44` | `commuteMode`／`extraNew` 是 computed 但依賴 `Date.now()`，跨午夜不重算：23:50 開通勤模式停在首頁，00:10 開始 → 當天所有 write 卡被延後 | 在 `buildQueue` 內以本次 `now` 現算 |

### 1b. 資料層 Medium（建議一併修）

| # | 位置 | 問題 | 修法 |
|---|---|---|---|
| D1 | `backup/index.ts:85,122`、`engine.ts syncSettings`、`queue.ts:87` | 匯入與雲端設定**無型別驗證**。缺 `updatedAt` 的設定列 → `setDoc` 拒絕 `undefined` → 之後每次同步都失敗；`value: "5"`／`null` → 佇列算出 `"50"`／`NaN` → 一天把全部假名排成新卡；紀錄缺 `reviewedAt` → NaN due → 卡片消失 | `migrateBackup` 逐列 schema 驗證；下載端同樣驗證；`buildDailyQueue` 對數值 `Number.isFinite` 防呆。同時補 `SCHEMA_VERSION` 比對（目前只寫不讀） |
| D2 | `srs/repository.ts:104` | `rebuildAllCards` 的 `cards.clear()` 不在交易內，中途失敗 → cards 全空 | clear 與 bulkPut 同一交易 |
| D3 | `handwriting/useWritingPractice.ts:172` | 「判定有誤」用 `where('cardId').equals(id).last()`，順序是 uuid 不是時間 → 同字多樣本會標到錯的 | `saveSample` 記住最後一筆 uuid 直接更新 |
| D4 ✅ | `sync/transport.ts:79` | 設定以 `merge: true` 寫入，巢狀 map（`kanaStrokeVariants`）會被深合併，與 per-key LWW 語意衝突 → 兩台顯示不同 | `setDoc(ref, patch, { mergeFields: Object.keys(patch) })` |
| D5 | `sync/useSync.ts:105`、`engine.ts:76` | `deleteCloudData`／換帳號不等 `inFlight`；`ensureUid` 的 put 與 `markAllUnsynced` 不原子 | 先 `await inFlight`；兩步放同一交易 |
| D6 | `db/index.ts:100,110` | `syncedAt` 索引無用（IndexedDB 不索引 null），實際全是 `.filter()` 全掃；`cards` 的 `itemId/skill/due/state` 索引無人使用 | 以 `0` 代表未同步讓索引生效（需 Dexie v6） |
| D7 | `sync/engine.ts:101` | 上傳成功但回應遺失 → 重試產生重複 chunk（可被去重吸收，只是成本） | client uuid 當文件 ID + `setDoc` 冪等 |
| D8 | `sync/useSync.ts`、`engine.ts` | 同步錯誤只寫 `lastError`，不進 `console.error` → 除錯面板看不到（F16 要求顯示同步錯誤） | 同時 `console.error` |

---

## 2. P2 之前應整理的結構問題

| # | 問題 | 影響 | 修法 |
|---|---|---|---|
| A1 | 卡片 ID 字串拼接／正則散落 6 處（`queue.ts`、`fsrs.ts parseCardId` 無驗證的 `as`、`weakness.ts:36` 與 `CalibrationPage.vue:25` 同一段 replace、`SessionPage.vue:104`）；`Rating` 型別在 `handwriting/session.ts` 與 `srs/types.ts` 撞名 | P2 加 `vocab:…#recognize` 時每一處都會默默算錯；兩個 barrel 一起 import 就型別衝突 | 新增 `src/core/srs/cardId.ts`（`makeCardId`／`parseCardId` 含守衛／`itemIdOf`／`displayKeyOf`）；handwriting 的改名 `HandwritingGrade` |
| A2 | `buildDailyQueue` 直接吃 `KanaItem[]`；read→write 的解鎖階梯寫死在 `queue.ts`、`useDailySession.ts`、`SessionPage.vue`（`skill === 'read' ? RecognizeCard : WriteCard`）三層；`Skill` 與 `KanaSkill` 同概念兩名字 | P2 需要 3 技能與不同解鎖順序，P3 題型更多 | srs 定義 `SchedulableItem { id; type; skills; order }` 與 per-type `SkillLadder { intro; unlockAfter; deferInCommute }`；SessionPage 改用 `cardRenderers` 註冊表 |
| A3 | 頁面直接碰 Dexie（7 頁 15 處）；`useDailySession.ts:54` 也繞過 repository | 「依卡片計次」已寫了兩份，P2 會第三份 | `core/handwriting/repository.ts`、`srs/repository.listCards()`、`core/debug/errorLogs.ts` |
| A4 | 頁面鷹架複製：toast 標記 9 頁各一份狀態、busy+try/finally 4 頁、確認面板 2 份、分享或下載檔案 2 份、`e instanceof Error ? e.message : String(e)` 15 次、`toLocaleString('zh-TW')` 7 次；約 180 處 inline `style` | 每多一種題型再抄一輪 | `AppToast.vue` + 全域狀態、`ConfirmSheet.vue`、`useAsyncAction()`、`errorMessage(e)`、`shareOrDownload()`；`.stack--N` utility |
| A5 | 手寫流程 UI 在 `WriteCard.vue:66-81` 與 `KanaDetailPage.vue:120-135` 逐字相同（含 `flashWrong` watch） | P2 單字手寫要第三份 | 抽 `HandwritingPractice.vue` |
| A6 | 死碼：`settingToRemote`、`stopSync`、`isSignedIn`、`addCardEvent`（`markKnown` 手抄了它的本體）、`variantId` 一路傳進卻被 `EFFECTIVE_VARIANT` 忽略、`settings.debugPanel` 定義卻無人讀；Pinia 已安裝但 0 個 store；4 處過期的「待 P1b」註解 | 混淆 | 刪除或接上；Pinia 要嘛放 toast／sync 狀態要嘛移除並改 README |
| A7 | 同步邊界完全信任遠端（`d.data() as …`），`SCHEMA_VERSION` 只寫不讀 | schema 升版時舊 App 會直接吞新格式 | `parseChunk()`／`parseRemoteSettings()` 驗證器（與 D1 同一件事） |

---

## 3. 規格落差（development-phases 勾了但沒做／做法不同）

### 3a. 使用者可感知

| # | 嚴重度 | 問題 | 建議 |
|---|---|---|---|
| S1 | High | **標記已會後無法恢復**。`MarkKnownPage.vue:144` 文案寫「可在假名詳細頁恢復」，但 `KanaDetailPage` 沒有任何 unsuspend 控制；`unsuspend`／`reset` 事件只有重放邏輯，沒有 UI 發出 | KanaDetailPage 加「恢復排程」／「重設進度」 |
| S2 | High | **標記已會頁排除拗音與小寫**（`group === 'youon' \|\| 'small'` continue）。已會 50 音的人仍要花約 17 天刷完 84 張拗音／小寫辨識卡才輪到片假名 | 加入拗音與小寫（整組或整行） |
| S3 | Medium | 內容包 CacheFirst 365 天、URL 無版本 → 日後補 そ／り 變體或修 romaji **到不了裝置** | StaleWhileRevalidate，或檔名帶 hash |
| S4 | Medium | 內容包不在 precache（`globIgnores content/**`）→ 加入主畫面後沒逛過 50 音表就離線，「開始學習」會失敗 | `kana.json` 進 precache；筆畫檔在 onboarding 完成後背景抓一次 |
| S5 | Medium | 新卡暫停（到期 > 100）時「今天想多學一點」按了沒反應也無提示 | 停用按鈕並說明 |
| S6 | Medium | Firebase SDK 每次冷啟動都載入（約 283 KB），與規劃 §7.2「只在登入或同步時才下載」及 `useSync.ts:10` 註解相反 | `syncMeta` 記「曾登入」旗標，沒有就不呼叫 `onAuthChanged` |
| S7 | Low | 設定頁無「刪除圖示會刪資料」警告（Q23 要求），只有引導頁有 | 加一行 |

### 3b. 有開關、沒讀者

| 項目 | 現況 |
|---|---|
| `settings.showFurigana` | 只有 SettingsPage 寫入，`JaText.showRuby` 無人傳入（P2 前無 ruby 內容，但清單勾了） |
| 筆畫版本選擇 `kanaStrokeVariants` | `EFFECTIVE_VARIANT = 'kanjivg'` 寫死，同步的是無作用的值；規劃還要求設定頁可選 |
| 「簡單」評分門檻 | `FAST_MS = 4000` 常數，規劃 §6.1 是「低於該字的平均時間」，`handwritingLogs.durationMs` 已有資料可算 |
| 每日「總量上限」（F5、Q18） | 只有 `newPauseThreshold`，沒有一天最多出幾張 |
| `settings.debugPanel` | 定義了，無人讀 |

### 3c. 做法與規劃不同（需決定採哪個）

| 項目 | 規劃 | 程式 |
|---|---|---|
| write 卡解鎖 | §6.2「首次複習通過後」 | read 卡 `state === Review` 且非今天（預設步驟下約第 3 天）；p1-verification 1-6 寫「讀卡熟了（非當天）」 |
| 小寫假名 | §5.1「作為獨立項目**練寫**」 | 也建 read 卡並佔新卡額度，要先通過「ぁ 怎麼念」才解鎖寫 |
| 出題順序 | 「越久沒複習的越先」 | 「到期越早越先」（多數情況相同） |
| 首次下載 | §7.5「自己裝置的 chunk 直接忽略」 | 首次不略過（為了 IndexedDB 被清的還原；commit 42bdcf9） |
| 設定 account 範圍 | 有「通勤模式預設值」 | 只有當日有效的 `commuteDate`（device） |
| 備份檔 `settings` | §7.6 物件 | 陣列 |

### 3d. 做了但規劃沒有（建議補進規劃書）

mouse 門檻係數 1.15；首頁預估時間（辨識 7 秒、手寫 15 秒）；「尚未同步過」提醒；回到前景觸發同步；匯入前快照只留 3 份；辨識題干擾選項規則（同行／同母音優先、seed 固定）；平假名 そ／り 有變體選單、片假名沒有。

---

## 4. 前端／UX／無障礙（High 已列入 §1 B5–B7）

| # | 嚴重度 | 問題 | 修法 |
|---|---|---|---|
| U1 | Medium | `router.ts:28` `scrollBehavior: () => ({ top: 0 })` 忽略 `savedPosition` → 從 50 音表下半部進詳細頁再返回跳回頂端 | `(to, from, saved) => saved ?? { top: 0 }` |
| U2 | Medium | 刪除帳號對話框是 `position: fixed; bottom: 0` 且含密碼輸入 → iOS 鍵盤會蓋住；無 `aria-modal`、無焦點移入、input 無 label | 改置中 modal 或以 `visualViewport` 調整；補 a11y 屬性（**需實機驗證**） |
| U3 | Medium | 觸控目標 < 44pt：stepper 32、chip 32、`.btn--sm` 36（WriteCard 的重寫／跳過）、多處 icon-btn 被 inline 縮到 36 | `::before { inset: -6px }` 撐命中區；stepper 直接 44 |
| U4 | Medium | 朱色實心按鈕硬編 `color: #fff`，深色模式對比約 2.3:1；design-system 沒有實心危險按鈕 | 新增 `--c-shu-ink` 與 `.btn--danger-fill` |
| U5 | Medium | 淺色多組「色字＋淡底」< 4.5:1（`--c-shu` on soft ≈4.2、`--c-warn` ≈3.9、`--c-ink-3` on paper ≈4.4） | 淺色 token 微調：shu `#B53A24`、warn `#8F5A0C`、ink-3 `#6E675C` |
| U6 | Medium | 無日文語音時沒有提示；`loadJaVoices()` 已有但正式流程沒用；三處 `speakJa` 吞掉錯誤 | 首次朗讀前檢查，為空時 toast 引導到 iOS 設定下載語音（**需實機驗證**） |
| U7 | Medium | 每次 pointermove 都 `getComputedStyle` 兩次（Pencil 240 Hz） | 在 resize 與主題切換時快取顏色 |
| U8 | Medium | 更新提示 toast 在 Session 頁壓住評分列；`.toast` `nowrap` 長訊息溢出 | 無 tabbar 頁覆寫 `--tabbar-h: 0`；toast `white-space: normal` |
| U9 | Medium | 50 音表每次進入 `handwritingLogs.toArray()` 全讀計數，紀錄無限成長（與 A3 同源） | repository 聚合計數 |
| U10 | Low | Onboarding 等 `getDeviceInfo()`（最多 1 秒）才知 standalone → 卡片閃一下；tablist 語意混用；progressbar 缺 aria；MarkKnown 的 `setTimeout(router.push)` 未清除；Confusables／Weak／KanaDetail 的 load 無 catch；SessionPage 區間預覽競態；字型 swap 無 preload；`KanaDetailPage` 用 `7rem` 而非 token；toast 2 秒 vs 文件 3 秒；manifest 無深色 `background_color` | 逐項小修 |

---

## 5. 文件漂移

1. `development-phases.md` 總覽寫 P1.5「程式完成，待實測」，同檔清單寫「兩台裝置實測往返成功」；README 寫「等待 iPhone 實測」。
2. write 卡解鎖規則三種說法（規劃書／p1-verification／程式）。
3. p1-verification 1-7「答錯重出時用提示」——實際新卡一律描摹，只有複習卡重出才提示。
4. README 專案結構過時（`modules/` 已有 kana、session；`tools/` 漏 kana、fonts）。
5. 關於頁列了尚未使用的 JMdict、Tatoeba，卻漏掉 README／§8 要求的 Tanos、JmdictFurigana——要嘛只列實際使用的，要嘛全列。
6. 規劃書 §5.2 `strokeVariants.id` 為 `"1"/"2"`，實作為 `"kanjivg"/"two"/"one"`。
7. p1-verification 5-1 預期「已同步 · 待上傳 0 筆」在設定頁，設定頁本身沒有上次同步時間。
8. `firebase/rules.test.ts` 不在 `npm test` 內（需 Java），README 宜說明。

---

## 6. 測試缺口

無測試：B1（merge 後 rebuild 中斷再 pull）、B2（chunk 位元組上限）、B8（跨午夜）、D1（壞檔案／設定缺 `updatedAt`／非數字值）、D2、D3（同字多樣本）、D5、同毫秒 tie-break、`endOfDay` 邊界（due 恰為隔日 00:00:00.000 不應到期）。`modules/` 2,900 行 Vue 零測試。脆弱點：`useWritingPractice.test.ts` 用真實 `setTimeout(10)`；`engine.test.ts` fakeCloud 不會觸發「同一 createdAt 超過一頁」分支。

---

## 7. 需要使用者決定的事

1. **P0 頁面**：整個刪除（建議），還是保留但只在 `import.meta.env.DEV` 顯示？
2. **write 卡解鎖規則**採哪個：(a) 規劃書「首次複習通過」（約第 2 天）、(b) 現行「Review 狀態且非當天」（約第 3 天）。決定後三份文件統一。
3. **小寫假名**：維持現狀（read + write），還是照規劃只建 write 卡？
4. **Pinia**：移除，還是用它放 toast／sync 全域狀態？
5. **結構整理（§2 A1–A5）的時機**：P2 之前一次做完（建議，約 2～3 個步驟），還是邊做 P2 邊改？
6. **「有開關、沒讀者」的項目**（§3b）：現在接上，還是把開關先藏起來等 P2？
7. **每日總量上限**（F5）：現在實作，還是從規劃移除？
8. **淺色 token 微調**（U5）會略改視覺色調；要改嗎？

## 8. 建議批次順序（每批一個 commit、修完各自 review）

1. 必修 bug：B3、B4、B5、B6、B7、B8、U1（半天內）
2. 同步可靠性：B1、B2、D1、D2、D4、D5、D8 + 測試
3. 規格落差：S1、S2、S3、S4、S5、S6、S7
4. 結構整理：A1+A4（cardId 模組、Rating 改名、共用鷹架）→ A2（SchedulableItem／SkillLadder／renderer 註冊表）→ A3、A5
5. 前端打磨：U2～U10
6. 文件統一：§5 全部 + development-phases 勾選狀態修正 + 規劃書補 §3d

---

## 9. 處理結果（2026-10-26）

使用者決策（§7）：P0 頁整個刪除；解鎖規則依規劃書；小寫假名維持 read + write；Pinia 用於全域狀態；結構整理在 P2 前做完；「有開關沒讀者」依建議（讀音標注藏起、筆畫版本保留並標示待補、簡單門檻與總量上限接上）；淺色 token 先不改。

| 批次 | commit | 內容 |
|---|---|---|
| 1 必修 bug | `97e89f5` | B3、B4、B5、B6、B7、B8、U1 |
| 2 同步可靠性 | `0aedc76` | B1、B2、D1、D2、D3、D4、D5、D8、A7；新增 6 個測試 |
| 3 規格落差 | `502be72` | S1、S2、S3、S4、S5、S6、S7；解鎖規則；§3b 四項（藏起／標示／接上／接上） |
| 4 結構（上） | `c3b9211` | A1、A3、A4、A6；U4（.btn--danger-fill） |
| 4 結構（下） | `fd7849f` | A2、A5 |
| 5 前端打磨 | `038bdf0` | U2、U3、U6、U7、U8、U9、U10 |
| 6 文件 | （本 commit） | §5 全部；規劃書 v0.4.2 附錄 D；development-phases；p1-verification 新增 1-11、1-12、2-4、2-5、3-8、5-9、6-4～6-6 |

**未處理／延後**：D6（`syncedAt` 索引改以 0 代表未同步，需 Dexie v6）、D7（上傳冪等需配合安全規則允許 update）、L2（同毫秒 tie-break）、U5（淺色 token，使用者決定不改）、`modules/` 元件測試、そ／り 替代寫法筆畫資料。
