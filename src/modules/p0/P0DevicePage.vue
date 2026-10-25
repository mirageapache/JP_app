<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { getDeviceInfo, type DeviceInfo } from '@/core/debug/deviceInfo'
import { isTtsSupported, loadJaVoices, speakJa, type JaVoice } from '@/core/tts'
import { copyText, useToast } from '@/core/ui/useToast'

/**
 * P0 裝置能力驗證：TTS、持久儲存、主畫面模式、API 支援度，
 * 以及一張可勾選、可複製結果的 P0 驗證清單（docs/development-phases.md）。
 */

const info = ref<DeviceInfo | null>(null)
const voices = ref<JaVoice[]>([])
const voiceName = ref('')
const ttsStatus = ref('')
const persistResult = ref('')
const { toast, show } = useToast()

const support = computed(() => ({
  'Pointer Events': typeof PointerEvent !== 'undefined',
  'getCoalescedEvents（完整筆跡）': typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype,
  'CompressionStream（備份 gzip）': typeof CompressionStream !== 'undefined',
  'IndexedDB': typeof indexedDB !== 'undefined',
  'Service Worker': 'serviceWorker' in navigator,
  'storage.persist': !!navigator.storage?.persist,
  'Web Share（匯出到檔案）': typeof navigator.share === 'function',
  '語音合成': isTtsSupported(),
  'Clipboard': !!navigator.clipboard?.writeText,
}))

/** P0 驗證清單（與 docs/development-phases.md 對應），勾選狀態存在本機 */
const CHECKLIST_KEY = 'jp-app.p0.checklist'
const checklist = ref<{ id: string; text: string; done: boolean; note: string }[]>([
  { id: 'debug', text: '除錯面板可顯示 console 輸出與未捕捉的錯誤', done: false, note: '' },
  { id: 'hw-smooth', text: '書寫流暢無明顯延遲', done: false, note: '' },
  { id: 'hw-correct', text: '正確書寫不被誤判', done: false, note: '' },
  { id: 'hw-wrong', text: '反向書寫與順序錯誤可被抓出', done: false, note: '' },
  { id: 'hw-pointer', text: '手指與 Apple Pencil 各測一次', done: false, note: '' },
  { id: 'hw-gesture', text: '畫布不觸發邊緣返回手勢與頁面捲動', done: false, note: '' },
  { id: 'fb-login', text: '電子郵件登入成功；關閉 App 隔天再開仍維持登入', done: false, note: '' },
  { id: 'fb-offline', text: '飛航模式下產生紀錄，恢復網路後自動上傳', done: false, note: '' },
  { id: 'fb-domain', text: 'Cloudflare Pages 預覽子網域是否需加入授權網域', done: false, note: '' },
  { id: 'tts-voice', text: 'TTS：主畫面模式下 ja-JP 語音可用', done: false, note: '' },
  { id: 'tts-silent', text: 'TTS：靜音開關撥下時是否仍有聲音', done: false, note: '' },
  { id: 'tts-auto', text: 'TTS：頁面互動過後，卡片顯示時能否自動播放', done: false, note: '' },
  { id: 'storage', text: 'storage.persist() 回傳結果；重開機後資料仍在', done: false, note: '' },
  { id: 'ui', text: 'Vant 4 與 Konsta UI 哪一個順手', done: false, note: '' },
])

function loadChecklist() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? '{}') as Record<string, { done: boolean; note: string }>
    for (const item of checklist.value) {
      const s = saved[item.id]
      if (s) Object.assign(item, s)
    }
  } catch {
    /* 無法讀取時維持預設 */
  }
}
function saveChecklist() {
  const out: Record<string, { done: boolean; note: string }> = {}
  for (const item of checklist.value) out[item.id] = { done: item.done, note: item.note }
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(out))
}

async function refresh() {
  info.value = await getDeviceInfo()
  voices.value = await loadJaVoices()
  if (!voiceName.value && voices.value[0]) voiceName.value = voices.value.find((v) => v.default)?.name ?? voices.value[0].name
}

async function speak(text: string) {
  ttsStatus.value = `播放「${text}」…`
  try {
    await speakJa(text, { voiceName: voiceName.value || undefined })
    ttsStatus.value = `「${text}」播放完畢`
  } catch (e) {
    ttsStatus.value = e instanceof Error ? e.message : String(e)
  }
}

/** 自動播放測試：點一下後，3 秒後由程式自行播放（模擬聽力卡顯示時自動播放） */
function speakLater() {
  ttsStatus.value = '3 秒後自動播放…（期間不要碰螢幕）'
  setTimeout(() => speak('みず'), 3000)
}

async function requestPersist() {
  if (!navigator.storage?.persist) {
    persistResult.value = '此環境不支援'
    return
  }
  const ok = await navigator.storage.persist()
  persistResult.value = ok ? '已允許持久儲存' : '未允許（iOS 可能需要加入主畫面）'
  await refresh()
}

async function copyResults() {
  const lines = [
    `日語練習帳 ${__APP_VERSION__} P0 驗證結果`,
    JSON.stringify({ ...info.value, support: support.value, voices: voices.value }, null, 2),
    '',
    ...checklist.value.map((c) => `[${c.done ? 'x' : ' '}] ${c.text}${c.note ? ` — ${c.note}` : ''}`),
  ]
  show((await copyText(lines.join('\n'))) ? '已複製，貼給 Claude 即可' : '無法存取剪貼簿')
}

onMounted(async () => {
  loadChecklist()
  await refresh()
})
</script>

<template>
  <div class="app">
    <AppTopbar title="裝置能力" back="/p0">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="重新整理" @click="refresh"><AppIcon name="refresh" /></button>
      </template>
    </AppTopbar>

    <main class="page" style="gap: var(--sp-4)">
      <!-- 環境 -->
      <section v-if="info" class="card stack" style="gap: var(--sp-1)">
        <div class="row row--between small"><span class="muted">主畫面模式</span><span>{{ info.standalone ? '是' : '否（瀏覽器）' }}</span></div>
        <div class="row row--between small"><span class="muted">Service Worker</span><span>{{ info.serviceWorker }}</span></div>
        <div class="row row--between small"><span class="muted">持久儲存</span><span>{{ info.storagePersisted === null ? '不支援' : info.storagePersisted ? '已允許' : '未允許' }}</span></div>
        <div class="row row--between small"><span class="muted">儲存用量</span><span class="num">{{ info.storageUsage ?? '—' }}</span></div>
        <button class="btn btn--secondary btn--sm" type="button" style="align-self: flex-start" @click="requestPersist">要求持久儲存</button>
        <p v-if="persistResult" class="small muted">{{ persistResult }}</p>
      </section>

      <!-- API 支援 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">API 支援</h2>
        <ul class="list">
          <li v-for="(ok, name) in support" :key="name" class="list-row" style="min-height: 40px">
            <div class="list-row__main small">{{ name }}</div>
            <span class="badge" :class="ok ? 'badge--ok' : 'badge--shu'">{{ ok ? '支援' : '不支援' }}</span>
          </li>
        </ul>
      </section>

      <!-- TTS -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">語音（ja-JP）<span class="caption faint">{{ voices.length }} 個語音</span></h2>
        <div class="card stack" style="gap: var(--sp-3)">
          <select v-model="voiceName" class="input" style="padding: 0 var(--sp-3)" aria-label="選擇語音">
            <option v-if="voices.length === 0" value="">（沒有日文語音）</option>
            <option v-for="v in voices" :key="v.name" :value="v.name">{{ v.name }}{{ v.localService ? '' : '（需網路）' }}</option>
          </select>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap">
            <button class="btn btn--secondary btn--sm" type="button" lang="ja" @click="speak('あ')">あ</button>
            <button class="btn btn--secondary btn--sm" type="button" lang="ja" @click="speak('たべる')">たべる</button>
            <button class="btn btn--secondary btn--sm" type="button" lang="ja" @click="speak('ここに名前を書いてください。')">例句</button>
            <button class="btn btn--primary btn--sm" type="button" @click="speakLater">測試自動播放</button>
          </div>
          <p class="small muted" aria-live="polite">{{ ttsStatus || '點按鈕播放。靜音開關撥下再播一次，確認是否有聲音。' }}</p>
        </div>
      </section>

      <!-- P0 驗證清單 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">P0 驗證清單<span class="caption faint num">{{ checklist.filter((c) => c.done).length }} / {{ checklist.length }}</span></h2>
        <ul class="list">
          <li v-for="c in checklist" :key="c.id" class="list-row" style="align-items: flex-start">
            <input v-model="c.done" type="checkbox" style="width: 22px; height: 22px; margin-top: 2px; accent-color: var(--c-primary)" :aria-label="c.text" @change="saveChecklist" />
            <div class="list-row__main stack" style="gap: 4px">
              <div class="small">{{ c.text }}</div>
              <input v-model="c.note" class="small" type="text" placeholder="備註（例如：手指誤判 2 次）" style="border: 0; border-bottom: 1px solid var(--c-line); background: transparent; padding: 2px 0; outline: 0" @change="saveChecklist" />
            </div>
          </li>
        </ul>
        <button class="btn btn--primary btn--block" type="button" @click="copyResults"><AppIcon name="copy" size="sm" />複製驗證結果</button>
      </section>
    </main>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
