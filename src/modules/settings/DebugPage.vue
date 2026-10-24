<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { db, type ErrorLog } from '@/core/db'
import { getDeviceInfo, type DeviceInfo } from '@/core/debug/deviceInfo'

const version = __APP_VERSION__
const logs = ref<ErrorLog[]>([])
const filter = ref<'all' | 'error' | 'warn'>('all')
const info = ref<DeviceInfo | null>(null)
const toast = ref('')

const shown = computed(() =>
  logs.value.filter((l) =>
    filter.value === 'all' ? true : filter.value === 'error' ? l.level === 'error' : l.level !== 'log',
  ),
)

async function load() {
  logs.value = await db.errorLogs.orderBy('at').reverse().limit(300).toArray()
  info.value = await getDeviceInfo()
}

async function clear() {
  await db.errorLogs.clear()
  await load()
}

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString('zh-TW', { hour12: false })
}

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2000)
}

async function copyAll() {
  const text = [
    `日語練習帳 ${version}`,
    JSON.stringify(info.value, null, 2),
    ...shown.value.map((l) => `[${fmtTime(l.at)}] ${l.level}: ${l.message}${l.stack ? '\n' + l.stack : ''}`),
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    showToast('已複製')
  } catch {
    showToast('無法存取剪貼簿')
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
      </section>

      <div class="row" style="gap: var(--sp-2)">
        <button class="btn btn--secondary btn--sm" type="button" @click="testError">測試錯誤</button>
        <button class="btn btn--secondary btn--sm" type="button" @click="testRejection">測試 Promise</button>
        <button class="btn btn--secondary btn--sm" type="button" @click="testWarn">測試警告</button>
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

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
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
