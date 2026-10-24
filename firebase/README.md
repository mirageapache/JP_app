# firebase/

Firestore 安全規則與測試（規劃書 §7.4）。

## 前置作業（由專案擁有者在 Firebase 主控台完成）

1. 建立 Firebase 專案（Spark 免費方案）
2. Authentication → 登入方式 → 啟用「電子郵件／密碼」；Google 登入也一併啟用（P0 要測）
3. Firestore Database → 建立資料庫（區域建議 `asia-east1`）
4. 專案設定 → 新增 Web 應用程式 → 把設定值填進專案根目錄的 `.env.local`（格式見 `.env.example`）
5. Authentication → 設定 → 授權網域：加入 Cloudflare Pages 的網域

## 部署安全規則

```bash
npx firebase-tools login            # 第一次需用瀏覽器登入
cd firebase
npx firebase-tools use --add        # 選擇專案，會產生 .firebaserc
npx firebase-tools deploy --only firestore:rules
```

## 執行規則測試

需要 Java 11 以上（Firestore Emulator 以 Java 執行）。

```bash
cd firebase
npx firebase-tools emulators:exec --only firestore --project demo-jp-app "cd .. && npx vitest run --config firebase/vitest.config.ts"
```

測試內容：本人可建立與讀取 chunk、其他人與未登入者不行、`createdAt` 必須是伺服器時間、chunk 不可更新、設定只有本人可讀寫。
