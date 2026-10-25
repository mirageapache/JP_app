import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore/lite'

/**
 * Firebase 初始化（規劃書 §7.2）。
 * - 設定值來自 .env.local（可公開；資料安全靠 Firestore 安全規則）
 * - 以動態 import 延遲載入，只在登入或同步時才下載 SDK，不影響首頁載入
 * - Firestore 使用 lite 版：離線由 Dexie 負責，不需要 Firestore 的離線快取
 */

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

export function readFirebaseConfig(): FirebaseConfig | null {
  const env = import.meta.env
  const apiKey = env.VITE_FIREBASE_API_KEY
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const appId = env.VITE_FIREBASE_APP_ID
  if (!apiKey || !authDomain || !projectId || !appId) return null
  return { apiKey, authDomain, projectId, appId }
}

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null
}

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let servicesPromise: Promise<FirebaseServices> | undefined

export function getFirebase(): Promise<FirebaseServices> {
  servicesPromise ??= (async () => {
    const config = readFirebaseConfig()
    if (!config) throw new Error('尚未設定 Firebase（請建立 .env.local，見 .env.example）')
    const [{ initializeApp, getApps }, authMod, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore/lite'),
    ])
    const app = getApps()[0] ?? initializeApp(config)
    // 登入狀態存在 IndexedDB，關閉 App 後仍維持（P0 驗證項目：隔天仍登入）
    // 只用電子郵件登入，不載入彈出視窗／重新導向的 resolver
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
    })
    return { app, auth, db: getFirestore(app) }
  })()
  servicesPromise.catch(() => (servicesPromise = undefined))
  return servicesPromise
}
