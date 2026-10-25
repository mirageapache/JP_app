<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import {
  describeAuthError,
  onAuthChanged,
  sendPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  type AuthUser,
} from '@/core/sync/auth'
import { firestoreTransport, recordCount, SCHEMA_VERSION, type ChunkDoc, type ChunkPayload } from '@/core/sync/transport'
import { getDeviceId } from '@/core/sync/deviceId'
import { isFirebaseConfigured } from '@/core/sync/firebaseApp'
import { useToast } from '@/core/ui/useToast'

/**
 * P0 Firebase 原型：驗證電子郵件登入、隔天仍維持登入、
 * 以及「離線時排入 → 恢復網路後自動上傳」的流程（規劃書 §7.7）。
 */

const FIRST_SIGN_IN_KEY = 'jp-app.p0.firstSignInAt'
const QUEUE_KEY = 'jp-app.p0.pendingChunks'

const configured = isFirebaseConfigured()
const user = ref<AuthUser | null>(null)
const authReady = ref(false)
const busy = ref(false)
const email = ref('')
const password = ref('')
const error = ref('')
const chunks = ref<ChunkDoc[]>([])
const queue = ref<ChunkPayload[]>(loadQueue())
const events = ref<string[]>([])
const online = ref(navigator.onLine)
const { toast, show: showToast } = useToast()
let unsubscribe: (() => void) | undefined

const firstSignInAt = computed(() => {
  if (!user.value) return null
  const v = localStorage.getItem(FIRST_SIGN_IN_KEY)
  return v ? new Date(Number(v)) : null
})
const signedInFor = computed(() => {
  if (!firstSignInAt.value) return ''
  const h = (Date.now() - firstSignInAt.value.getTime()) / 36e5
  return h < 1 ? `${Math.round(h * 60)} 分鐘` : h < 48 ? `${h.toFixed(1)} 小時` : `${(h / 24).toFixed(1)} 天`
})

function log(msg: string) {
  events.value.unshift(`${new Date().toLocaleTimeString('zh-TW', { hour12: false })} ${msg}`)
  if (events.value.length > 50) events.value.pop()
}

function loadQueue(): ChunkPayload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as ChunkPayload[]
  } catch {
    return []
  }
}
function saveQueue() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.value))
}

async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  error.value = ''
  try {
    const r = await fn()
    log(`${label}：成功`)
    return r
  } catch (e) {
    error.value = describeAuthError(e)
    log(`${label}：失敗 — ${error.value}`)
    return undefined
  } finally {
    busy.value = false
  }
}

function markSignedIn() {
  if (!localStorage.getItem(FIRST_SIGN_IN_KEY)) localStorage.setItem(FIRST_SIGN_IN_KEY, String(Date.now()))
}

const doSignIn = () => run('電子郵件登入', () => signInWithEmail(email.value.trim(), password.value))
const doSignUp = () => run('建立帳號', () => signUpWithEmail(email.value.trim(), password.value))
const doReset = () => run('寄送重設密碼信', () => sendPasswordReset(email.value.trim()))
const doSignOut = () =>
  run('登出', async () => {
    await signOut()
    localStorage.removeItem(FIRST_SIGN_IN_KEY)
    chunks.value = []
    showToast('已登出')
  })

function makeChunk(): ChunkPayload {
  return {
    deviceId: getDeviceId(),
    schemaVersion: SCHEMA_VERSION,
    reviewLogs: [
      { uuid: crypto.randomUUID(), cardId: 'kana:あ#read', rating: 3, reviewedAt: Date.now(), durationMs: 0, mode: 'session', paramsVersion: 'p0-test', deviceId: getDeviceId(), syncedAt: null },
    ],
    cardEvents: [],
    handwritingLogs: [],
  }
}

const doUpload = () =>
  run('上傳測試 chunk', async () => {
    if (!user.value) throw new Error('尚未登入')
    const id = await firestoreTransport.uploadChunk(user.value.uid, makeChunk())
    log(`chunk ${id} 已寫入`)
    await refresh()
  })

const refresh = () =>
  run('讀取雲端 chunk', async () => {
    if (!user.value) throw new Error('尚未登入')
    chunks.value = (await firestoreTransport.listChunks(user.value.uid)).reverse()
  })

function enqueue() {
  queue.value.push(makeChunk())
  saveQueue()
  log(`已排入待上傳（目前 ${queue.value.length} 筆）${online.value ? '' : '，離線中'}`)
  if (online.value) void flush()
}

async function flush() {
  if (!user.value || queue.value.length === 0 || busy.value) return
  await run(`同步待上傳 ${queue.value.length} 筆`, async () => {
    while (queue.value.length) {
      const next = queue.value[0]!
      await firestoreTransport.uploadChunk(user.value!.uid, next)
      queue.value.shift()
      saveQueue()
    }
    await refresh()
  })
}

function onOnline() {
  online.value = true
  log('網路恢復')
  void flush()
}
function onOffline() {
  online.value = false
  log('離線')
}

onMounted(async () => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  if (!configured) return
  unsubscribe = await onAuthChanged((u) => {
    user.value = u
    authReady.value = true
    if (u) {
      markSignedIn()
      log(`登入狀態：${u.email ?? u.uid}（${u.provider}）`)
      void flush()
    } else log('登入狀態：未登入')
  })
})
onBeforeUnmount(() => {
  unsubscribe?.()
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})

function fmt(ms: number) {
  return ms ? new Date(ms).toLocaleString('zh-TW', { hour12: false }) : '—'
}
</script>

<template>
  <div class="app">
    <AppTopbar title="Firebase 原型" back="/p0" />

    <main class="page" style="gap: var(--sp-4)">
      <div v-if="!configured" class="banner banner--warn">
        <AppIcon name="alert" size="sm" />
        <div>
          <strong>尚未設定 Firebase</strong>
          請依 firebase/README.md 建立專案，把設定值填進 .env.local 後重新建置。
        </div>
      </div>

      <template v-else>
        <div class="row row--between small">
          <span class="muted">網路</span>
          <span :class="online ? '' : 'faint'">{{ online ? '連線中' : '離線' }}</span>
        </div>

        <!-- 登入狀態 -->
        <section v-if="!authReady" class="card small muted">正在還原登入狀態…</section>

        <section v-else-if="user" class="card stack" style="gap: var(--sp-2)">
          <div class="row" style="gap: var(--sp-2)">
            <AppIcon name="user" />
            <div class="grow">
              <div style="font-weight: 600">{{ user.email ?? '（無電子郵件）' }}</div>
              <div class="small faint">{{ user.provider }} · {{ user.uid.slice(0, 8) }}…</div>
            </div>
            <button class="btn btn--secondary btn--sm" type="button" :disabled="busy" @click="doSignOut">登出</button>
          </div>
          <div class="row row--between small">
            <span class="muted">登入狀態維持</span>
            <span class="num">{{ signedInFor }}（自 {{ firstSignInAt?.toLocaleString('zh-TW', { hour12: false }) }}）</span>
          </div>
          <p class="caption faint">P0 驗證：關閉 App 隔天再開，這裡應仍顯示已登入，且時間持續累計。</p>
        </section>

        <form v-else class="card stack" style="gap: var(--sp-3)" @submit.prevent="doSignIn">
          <div class="field">
            <label for="email">電子郵件</label>
            <div class="input"><AppIcon name="mail" size="sm" /><input id="email" v-model="email" type="email" autocomplete="email" inputmode="email" required /></div>
          </div>
          <div class="field">
            <label for="pw">密碼</label>
            <div class="input"><AppIcon name="lock" size="sm" /><input id="pw" v-model="password" type="password" autocomplete="current-password" minlength="6" required /></div>
          </div>
          <button class="btn btn--primary btn--lg btn--block" type="submit" :disabled="busy">登入</button>
          <div class="row row--between">
            <button class="btn btn--ghost btn--sm" type="button" :disabled="busy" @click="doSignUp">建立帳號</button>
            <button class="btn btn--ghost btn--sm" type="button" :disabled="busy || !email" @click="doReset">忘記密碼</button>
          </div>
        </form>

        <p v-if="error" class="banner banner--shu"><AppIcon name="alert" size="sm" />{{ error }}</p>

        <!-- 上傳與離線佇列 -->
        <section v-if="user" class="stack" style="gap: var(--sp-2)">
          <h2 class="section-title">Firestore</h2>
          <div class="row" style="gap: var(--sp-2)">
            <button class="btn btn--primary btn--sm" type="button" :disabled="busy" @click="doUpload"><AppIcon name="upload" size="sm" />上傳測試 chunk</button>
            <button class="btn btn--secondary btn--sm" type="button" :disabled="busy" @click="refresh"><AppIcon name="refresh" size="sm" />讀取</button>
          </div>
          <div class="row" style="gap: var(--sp-2)">
            <button class="btn btn--secondary btn--sm" type="button" @click="enqueue"><AppIcon name="clock" size="sm" />排入待上傳（離線也可）</button>
            <span class="badge" :class="queue.length ? 'badge--warn' : ''">待上傳 {{ queue.length }}</span>
          </div>
          <p class="caption faint">P0 驗證：開飛航模式 → 按「排入待上傳」→ 關閉飛航模式，應自動上傳並出現在下方清單。</p>

          <ul v-if="chunks.length" class="list">
            <li v-for="c in chunks" :key="c.id" class="list-row">
              <div class="list-row__main">
                <div class="list-row__title small num">{{ fmt(c.createdAt) }}</div>
                <div class="list-row__sub">{{ c.deviceId.slice(0, 8) }}… · {{ recordCount(c) }} 筆紀錄 · schema {{ c.schemaVersion }}</div>
              </div>
            </li>
          </ul>
          <p v-else class="small faint" style="text-align: center">雲端還沒有 chunk</p>
        </section>
      </template>

      <!-- 事件紀錄 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">事件</h2>
        <ul class="card" style="list-style: none; margin: 0; padding: var(--sp-3); font-size: var(--fs-caption); display: flex; flex-direction: column; gap: 4px">
          <li v-for="(e, i) in events" :key="i" class="num">{{ e }}</li>
          <li v-if="events.length === 0" class="faint">尚無事件</li>
        </ul>
      </section>
    </main>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
