import { computed, reactive, readonly } from 'vue'
import { onAuthChanged, type AuthUser } from './auth'
import { countPending, createSyncEngine, getSyncMeta, type SyncResult } from './engine'
import { isFirebaseConfigured } from './firebaseApp'
import { firestoreTransport } from './transport'

/**
 * 同步狀態與觸發（規劃書 §7.5）：
 * 開啟 App、完成一輪練習、網路恢復、App 進入背景（盡力而為）、開啟期間每 5 分鐘。
 * Firebase 只在已設定且使用者登入時才載入。
 */

const INTERVAL_MS = 5 * 60 * 1000
/** 超過幾天未同步要在首頁提醒（規劃書 §7.5） */
export const REMIND_AFTER_DAYS = 3

interface SyncState {
  configured: boolean
  /** null = 尚未得知登入狀態 */
  user: AuthUser | null | undefined
  status: 'idle' | 'syncing' | 'error'
  lastError: string | null
  lastSyncAt: number | null
  pending: number
  lastResult: SyncResult | null
}

const state = reactive<SyncState>({
  configured: isFirebaseConfigured(),
  user: undefined,
  status: 'idle',
  lastError: null,
  lastSyncAt: null,
  pending: 0,
  lastResult: null,
})

const engine = createSyncEngine(firestoreTransport)
let started = false
let timer: ReturnType<typeof setInterval> | undefined
let inFlight: Promise<SyncResult | null> | null = null

export const syncState = readonly(state)
export const isSignedIn = computed(() => !!state.user)

export async function refreshPending(): Promise<void> {
  state.pending = await countPending()
  const meta = await getSyncMeta()
  state.lastSyncAt = meta.lastSyncAt
  state.lastError = meta.lastError
}

/** 執行一輪同步（同時只會有一個在跑）；未登入時什麼都不做 */
export function requestSync(): Promise<SyncResult | null> {
  if (!state.configured || !state.user) return Promise.resolve(null)
  if (inFlight) return inFlight
  const uid = state.user.uid
  state.status = 'syncing'
  inFlight = engine
    .sync(uid)
    .then(async (r) => {
      state.status = 'idle'
      state.lastResult = r
      await refreshPending()
      return r
    })
    .catch(async (e) => {
      state.status = 'error'
      state.lastError = e instanceof Error ? e.message : String(e)
      await refreshPending()
      return null
    })
    .finally(() => (inFlight = null))
  return inFlight
}

/** 在 App 啟動時呼叫一次：監聽登入狀態並掛上觸發時機 */
export function startSync(): void {
  if (started) return
  started = true
  void refreshPending().catch((e) => console.error('讀取同步狀態失敗', e))
  if (!state.configured) {
    state.user = null
    return
  }
  void onAuthChanged((u) => {
    state.user = u
    if (u) void requestSync()
  })
  window.addEventListener('online', () => void requestSync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestSync()
    else if (state.user && state.pending > 0) void requestSync() // 進入背景時盡力上傳
  })
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void requestSync()
  }, INTERVAL_MS)
}

export function stopSync(): void {
  if (timer) clearInterval(timer)
  started = false
}

export async function deleteCloudData(): Promise<number> {
  if (!state.user) throw new Error('尚未登入')
  const n = await engine.deleteCloud(state.user.uid)
  await refreshPending()
  return n
}

/** 距離上次同步的天數；從未同步為 null */
export function daysSinceSync(now = Date.now()): number | null {
  return state.lastSyncAt === null ? null : Math.floor((now - state.lastSyncAt) / 86400000)
}
