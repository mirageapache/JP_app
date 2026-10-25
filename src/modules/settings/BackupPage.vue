<script setup lang="ts">
import { markRaw, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import {
  backupFileName,
  canGzip,
  collectBackup,
  createSnapshot,
  gzipText,
  importBackup,
  readBackupFile,
  restoreSnapshot,
  type BackupFile,
} from '@/core/backup'
import { db, type Snapshot } from '@/core/db'
import { useToast } from '@/core/ui/useToast'

/** 備份與還原（規劃書 §7.6）：匯出到「檔案」、匯入合併、匯入前快照可回復 */
const version = __APP_VERSION__
const counts = ref({ reviewLogs: 0, cardEvents: 0, handwritingLogs: 0 })
const snapshots = ref<Snapshot[]>([])
const pending = ref<{ file: BackupFile; name: string } | null>(null)
const applySettings = ref(false)
const busy = ref(false)
const result = ref('')
const fileInput = ref<HTMLInputElement>()
const { toast, show } = useToast()

async function load() {
  const [r, c, h, s] = await Promise.all([db.reviewLogs.count(), db.cardEvents.count(), db.handwritingLogs.count(), db.snapshots.orderBy('at').reverse().toArray()])
  counts.value = { reviewLogs: r, cardEvents: c, handwritingLogs: h }
  snapshots.value = s
}

async function exportBackup() {
  busy.value = true
  try {
    const data = await collectBackup(version)
    const text = JSON.stringify(data)
    const gzip = canGzip()
    const blob = gzip ? await gzipText(text) : new Blob([text], { type: 'application/json' })
    const name = backupFileName(gzip)
    const file = new File([blob], name, { type: gzip ? 'application/gzip' : 'application/json' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '日語練習帳備份' })
        show('已開啟分享面板，請選「儲存到檔案」')
        return
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
      }
    }
    // 桌面瀏覽器：直接下載
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    show(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  try {
    pending.value = { file: markRaw(await readBackupFile(f)), name: f.name }
    result.value = ''
  } catch (err) {
    show(err instanceof Error ? err.message : String(err))
  }
}

async function confirmImport() {
  if (!pending.value) return
  busy.value = true
  try {
    await createSnapshot(version)
    const s = await importBackup(pending.value.file, { applySettings: applySettings.value })
    result.value = `已合併：複習紀錄 +${s.added.reviewLogs}、卡片事件 +${s.added.cardEvents}、手寫紀錄 +${s.added.handwritingLogs}；重建 ${s.rebuiltCards} 張卡片${s.settingsApplied ? '；設定已以備份檔為準' : ''}`
    pending.value = null
    await load()
  } catch (e) {
    show(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function restore(id: number) {
  busy.value = true
  try {
    await restoreSnapshot(id)
    show('已回復到匯入前的狀態')
    await load()
  } catch (e) {
    show(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

function fmt(ms: number) {
  return new Date(ms).toLocaleString('zh-TW', { hour12: false })
}

onMounted(load)
</script>

<template>
  <div class="app">
    <AppTopbar title="備份與還原" back="/settings" />
    <main class="page" style="gap: var(--sp-5)">
      <section class="card stack" style="gap: var(--sp-2)">
        <div class="row row--between small"><span class="muted">複習紀錄</span><span class="num">{{ counts.reviewLogs }}</span></div>
        <div class="row row--between small"><span class="muted">卡片事件</span><span class="num">{{ counts.cardEvents }}</span></div>
        <div class="row row--between small"><span class="muted">手寫紀錄</span><span class="num">{{ counts.handwritingLogs }}</span></div>
      </section>

      <section class="stack">
        <h2 class="section-title">匯出</h2>
        <button class="btn btn--primary btn--lg btn--block" type="button" :disabled="busy" @click="exportBackup"><AppIcon name="download" size="sm" />匯出學習紀錄</button>
        <p class="small faint">iPhone 會開啟分享面板，選「儲存到檔案」可存到 iCloud Drive。檔案為 gzip 壓縮的 JSON，不含筆跡樣本。</p>
      </section>

      <section class="stack">
        <h2 class="section-title">匯入</h2>
        <input ref="fileInput" type="file" accept=".json,.gz,application/json,application/gzip" hidden @change="onPick" />
        <button class="btn btn--secondary btn--lg btn--block" type="button" :disabled="busy" @click="fileInput?.click()"><AppIcon name="upload" size="sm" />選擇備份檔</button>
        <p class="small faint">匯入會與現有紀錄<strong>合併</strong>（同一筆紀錄不會重複），不會覆蓋。匯入前會自動建立快照，可回復。</p>

        <div v-if="pending" class="card stack" style="gap: var(--sp-3)">
          <div>
            <strong>{{ pending.name }}</strong>
            <div class="small muted num">匯出於 {{ pending.file.exportedAt ? fmt(Date.parse(pending.file.exportedAt)) : '不明' }} · 複習 {{ pending.file.reviewLogs.length }} · 事件 {{ pending.file.cardEvents.length }} · 手寫 {{ pending.file.handwritingLogs.length }}</div>
          </div>
          <label class="row" style="gap: var(--sp-2)">
            <input v-model="applySettings" type="checkbox" style="width: 20px; height: 20px; accent-color: var(--c-primary)" />
            <span class="small">以備份檔的設定為準（每日新卡、目標等；裝置設定不受影響）</span>
          </label>
          <div class="row" style="gap: var(--sp-2)">
            <button class="btn btn--primary grow" type="button" :disabled="busy" @click="confirmImport">合併匯入</button>
            <button class="btn btn--secondary" type="button" :disabled="busy" @click="pending = null">取消</button>
          </div>
        </div>
        <p v-if="result" class="banner"><AppIcon name="check" size="sm" />{{ result }}</p>
      </section>

      <section v-if="snapshots.length" class="stack">
        <h2 class="section-title">匯入前的快照<span class="caption faint">保留最近 3 份</span></h2>
        <ul class="list">
          <li v-for="s in snapshots" :key="s.id" class="list-row">
            <div class="list-row__main"><div class="list-row__title num">{{ fmt(s.at) }}</div><div class="list-row__sub">匯入前自動建立</div></div>
            <button class="btn btn--secondary btn--sm" type="button" :disabled="busy" @click="restore(s.id!)">回復</button>
          </li>
        </ul>
        <p class="small faint">回復會以快照內容取代目前的紀錄與設定。</p>
      </section>
    </main>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
