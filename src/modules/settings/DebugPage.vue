<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import type { ErrorLog } from '@/core/db'
import { clearErrorLogs, listErrorLogs } from '@/core/debug/errorLogs'
import { getDeviceInfo, type DeviceInfo } from '@/core/debug/deviceInfo'
import { rebuildAllCards } from '@/core/srs/repository'
import { isTtsSupported, loadJaVoices, speakJa, type JaVoice } from '@/core/tts'
import { copyText, useToast } from '@/core/ui/useToast'
import { errorMessage } from '@/core/util/errors'

const version = __APP_VERSION__
const logs = ref<ErrorLog[]>([])
const filter = ref<'all' | 'error' | 'warn'>('all')
const info = ref<DeviceInfo | null>(null)
const voices = ref<JaVoice[]>([])
const voiceName = ref('')
const ttsStatus = ref('')
const persistResult = ref('')
const { show: showToast } = useToast()

/** 手寫、備份、同步、朗讀各自依賴的瀏覽器能力 */
const support = computed(() => ({
  'Pointer Events': typeof PointerEvent !== 'undefined',
  'getCoalescedEvents（完整筆跡）': typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype,
  'CompressionStream（備份 gzip）': typeof CompressionStream !== 'undefined',
  IndexedDB: typeof indexedDB !== 'undefined',
  'Service Worker': 'serviceWorker' in navigator,
  'storage.persist': !!navigator.storage?.persist,
  'Web Share（匯出到檔案）': typeof navigator.share === 'function',
  語音合成: isTtsSupported(),
  Clipboard: !!navigator.clipboard?.writeText,
}))

const shown = computed(() =>
  logs.value.filter((l) =>
    filter.value === 'all' ? true : filter.value === 'error' ? l.level === 'error' : l.level !== 'log',
  ),
)

async function load() {
  logs.value = await listErrorLogs()
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
    ttsStatus.value = errorMessage(e)
  }
}

async function requestPersist() {
  if (!navigator.storage?.persist) {
    persistResult.value = '此環境不支援'
    return
  }
  const ok = await navigator.storage.persist()
  persistResult.value = ok ? '已允許持久儲存' : '未允許（iOS 可能需要加入主畫面）'
  info.value = await getDeviceInfo()
}

async function clear() {
  await clearErrorLogs()
  await load()
}

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString('zh-TW', { hour12: false })
}

async function copyAll() {
  const text = [
    `日語練習帳 ${version}`,
    JSON.stringify({ ...info.value, support: support.value, voices: voices.value }, null, 2),
    ...shown.value.map((l) => `[${fmtTime(l.at)}] ${l.level}: ${l.message}${l.stack ? '\n' + l.stack : ''}`),
  ].join('\n')
  showToast((await copyText(text)) ? '已複製' : '無法存取剪貼簿')
}

/** 資料修復：由紀錄重建 cards 快取（同步或匯入中斷後卡片狀態不對時用） */
async function rebuildCards() {
  try {
    const n = await rebuildAllCards()
    showToast(`已重建 ${n} 張卡片`)
  } catch (e) {
    showToast(errorMessage(e))
  }
}

function testError() {
  throw new Error('測試用錯誤（可忽略）')
}
function testRejection() {
  void Promise.reject(new Error('測試用 Promise 拒絕（可忽略）'))
}
function testWarn() {
  console.warn('測試用警告（可忽略）')
  setTimeout(load, 100)
}

onMounted(load)
</script>

<template>
  <div class="app">
    <AppTopbar title="除錯面板" back="/settings">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="重新整理" @click="load"><AppIcon name="refresh" /></button>
      </template>
    </AppTopbar>

    <main class="page" style="gap: var(--sp-4)">
      <section v-if="info" class="card stack" style="gap: var(--sp-1)">
        <!-- 裝置資訊 -->
        <div class="row row--between small"><span class="muted">版本</span><span class="num">{{ version }}</span></div>
        <div class="row row--between small"><span class="muted">主畫面模式</span><span>{{ info.standalone ? '是' : '否（瀏覽器）' }}</span></div>
        <div class="row row--between small"><span class="muted">網路</span><span>{{ info.online ? '連線中' : '離線' }}</span></div>
        <div class="row row--between small"><span class="muted">Service Worker</span><span>{{ info.serviceWorker }}</span></div>
        <div class="row row--between small"><span class="muted">持久儲存</span><span>{{ info.storagePersisted === null ? '不支援' : info.storagePersisted ? '已允許' : '未允許' }}</span></div>
        <div class="row row--between small"><span class="muted">儲存用量</span><span class="num">{{ info.storageUsage ?? '—' }}</span></div>
        <div class="row row--between small"><span class="muted">畫面</span><span class="num">{{ info.viewport }} @{{ info.devicePixelRatio }}x</span></div>
        <p class="caption faint" style="word-break: break-all">{{ info.userAgent }}</p>
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

      <!-- 語音 -->
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
          </div>
          <p class="small muted" aria-live="polite">{{ ttsStatus || '點按鈕播放；靜音開關撥下時 iOS 不會出聲。' }}</p>
        </div>
      </section>

      <div class="row" style="gap: var(--sp-2); flex-wrap: wrap">
        <button class="btn btn--secondary btn--sm" type="button" @click="testError">測試錯誤</button>
        <button class="btn btn--secondary btn--sm" type="button" @click="testRejection">測試 Promise</button>
        <button class="btn btn--secondary btn--sm" type="button" @click="testWarn">測試警告</button>
        <button class="btn btn--secondary btn--sm" type="button" @click="rebuildCards">重建所有卡片</button>
      </div>

      <div class="row row--between">
        <div class="segmented" style="width: 200px">
          <button type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
          <button type="button" :aria-pressed="filter === 'warn'" @click="filter = 'warn'">警告+</button>
          <button type="button" :aria-pressed="filter === 'error'" @click="filter = 'error'">錯誤</button>
        </div>
        <div class="row" style="gap: var(--sp-1)">
          <button class="icon-btn" type="button" aria-label="複製全部" @click="copyAll"><AppIcon name="copy" /></button>
          <button class="icon-btn" type="button" aria-label="清除紀錄" @click="clear"><AppIcon name="trash" /></button>
        </div>
      </div>

      <p v-if="shown.length === 0" class="small faint" style="text-align: center">沒有紀錄</p>
      <ul v-else class="log-list">
        <li v-for="l in shown" :key="l.id" class="log" :class="`log--${l.level}`">
          <div class="row row--between caption">
            <span class="log__level">{{ l.level }}</span>
            <span class="faint num">{{ fmtTime(l.at) }}</span>
          </div>
          <div class="log__msg">{{ l.message }}</div>
          <pre v-if="l.stack" class="log__stack">{{ l.stack }}</pre>
        </li>
      </ul>
    </main>

  </div>
</template>

<style scoped>
.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.log {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-line);
  border-left-width: 3px;
  border-radius: var(--r-sm);
  background: var(--c-surface);
  font-size: var(--fs-small);
}
.log--error {
  border-left-color: var(--c-shu);
}
.log--warn {
  border-left-color: var(--c-warn);
}
.log__level {
  font-weight: 600;
  text-transform: uppercase;
}
.log__msg {
  word-break: break-word;
  white-space: pre-wrap;
}
.log__stack {
  margin: var(--sp-1) 0 0;
  font-size: 11px;
  color: var(--c-ink-3);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
