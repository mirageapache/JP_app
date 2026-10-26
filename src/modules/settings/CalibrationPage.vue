<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import ConfirmSheet from '@/components/ConfirmSheet.vue'
import type { StrokeSample } from '@/core/db'
import { clearSamples, deleteSample, deleteSamplesOf, listSamples } from '@/core/handwriting/repository'
import { loadSettings, setSetting, settings } from '@/core/settings'
import { displayKeyOf } from '@/core/srs/cardId'
import { shareFile } from '@/core/ui/share'
import { copyText, useToast } from '@/core/ui/useToast'

/**
 * 手寫調校模式（規劃書 F7、§6.1「調校模式」）：
 * 開啟時才保存筆跡；可匯出為測試資料、刪除單字／全部樣本；關閉時詢問是否一併刪除。
 */
const samples = ref<StrokeSample[]>([])
const confirm = ref<'all' | 'off' | null>(null)
/** 展開顯示單筆樣本的字 */
const expanded = ref<string | null>(null)
const switchEl = ref<HTMLInputElement>()

const KIND_TEXT: Record<string, string> = { pass: '通過', position: '位置', direction: '方向', order: '順序', connected: '連筆', shape: '形狀' }
const { show } = useToast()

const groups = computed(() => {
  const map = new Map<string, { cardId: string; char: string; count: number; wrong: number; touch: number; pen: number }>()
  for (const s of samples.value) {
    const g = map.get(s.cardId) ?? { cardId: s.cardId, char: displayKeyOf(s.cardId), count: 0, wrong: 0, touch: 0, pen: 0 }
    g.count++
    if (s.judgedCorrect === false) g.wrong++
    if (s.pointerType === 'pen') g.pen++
    else g.touch++
    map.set(s.cardId, g)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
})
const wrongTotal = computed(() => samples.value.filter((s) => s.judgedCorrect === false).length)
const sizeKb = computed(() => Math.round(JSON.stringify(samples.value).length / 1024))

async function load() {
  await loadSettings()
  samples.value = await listSamples()
}

async function toggle(on: boolean) {
  if (!on && samples.value.length) {
    // 先把原生開關撥回來，等使用者在面板裡決定；取消時開關與設定才會一致
    if (switchEl.value) switchEl.value.checked = true
    confirm.value = 'off'
    return
  }
  await setSetting('tuningMode', on)
}

async function turnOff(deleteSamples: boolean) {
  confirm.value = null
  if (deleteSamples) await clearSamples()
  await setSetting('tuningMode', false)
  await load()
}

async function deleteOne(uuid: string) {
  await deleteSample(uuid)
  await load()
}

function samplesOf(cardId: string) {
  return samples.value.filter((s) => s.cardId === cardId).sort((a, b) => b.recordedAt - a.recordedAt)
}

async function deleteCard(cardId: string) {
  await deleteSamplesOf(cardId)
  await load()
  show('已刪除')
}

async function deleteAll() {
  confirm.value = null
  await clearSamples()
  await load()
  show('已刪除全部樣本')
}

/** 匯出為 tests/fixtures/strokes/ 可用的格式（依字分檔由開發者整理） */
async function exportSamples() {
  const payload = {
    app: __APP_VERSION__,
    userAgent: navigator.userAgent,
    exportedAt: new Date().toISOString(),
    samples: samples.value,
  }
  const text = JSON.stringify(payload)
  const file = new File([text], `stroke-samples-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' })
  if ((await shareFile(file, '筆跡樣本')) !== 'unsupported') return
  // 不支援分享檔案時改用剪貼簿
  show((await copyText(text)) ? `已複製 ${samples.value.length} 筆樣本` : '無法分享或複製')
}

onMounted(load)
</script>

<template>
  <div class="app">
    <AppTopbar title="手寫調校模式" back="/settings" />

    <main class="page" style="gap: var(--sp-5)">
      <ul class="list">
        <li>
          <label class="list-row">
            <div class="list-row__main">
              <div class="list-row__title">調校模式</div>
              <div class="list-row__sub">開啟期間保存每次書寫的筆跡座標</div>
            </div>
            <span class="switch"><input ref="switchEl" type="checkbox" :checked="settings.tuningMode" aria-label="調校模式" @change="toggle(($event.target as HTMLInputElement).checked)" /><span></span></span>
          </label>
        </li>
      </ul>

      <div class="banner banner--warn">
        <AppIcon name="info" size="sm" />
        <div>筆跡只存在這台裝置，<strong style="display: inline">不會同步到雲端</strong>，也不在一般備份中。練習畫面會多出「判定有誤」按鈕。</div>
      </div>

      <section class="stat-grid">
        <div class="stat"><div class="stat__value num">{{ samples.length }}</div><div class="stat__label">樣本</div></div>
        <div class="stat"><div class="stat__value num">{{ wrongTotal }}</div><div class="stat__label">標記誤判</div></div>
        <div class="stat"><div class="stat__value num">{{ sizeKb }}<span class="small"> KB</span></div><div class="stat__label">佔用空間</div></div>
      </section>

      <section class="stack">
        <h2 class="section-title">樣本<span class="caption faint">依字分組</span></h2>
        <p v-if="groups.length === 0" class="small faint" style="text-align: center">還沒有樣本。開啟調校模式後到假名詳細頁練習即可收集。</p>
        <ul v-else class="list">
          <li v-for="g in groups" :key="g.cardId">
            <div class="list-row">
              <button class="row grow" type="button" style="background: none; border: 0; padding: 0; text-align: left; color: inherit" :aria-expanded="expanded === g.cardId" @click="expanded = expanded === g.cardId ? null : g.cardId">
                <span class="ja-display" lang="ja" style="font-size: 1.5rem; width: 32px; text-align: center">{{ g.char }}</span>
                <div class="list-row__main">
                  <div class="list-row__title num">{{ g.count }} 筆</div>
                  <div class="list-row__sub">
                    <span class="badge" :class="g.wrong ? 'badge--shu' : 'badge--ok'">{{ g.wrong }} 誤判</span>
                    手指 {{ g.touch }}<template v-if="g.pen"> · 筆 {{ g.pen }}</template>

                  </div>
                </div>
              </button>
              <button class="icon-btn" type="button" :aria-label="`刪除 ${g.char} 的全部樣本`" @click="deleteCard(g.cardId)"><AppIcon name="trash" size="sm" /></button>
            </div>
            <ul v-if="expanded === g.cardId" class="sample-list">
              <li v-for="s in samplesOf(g.cardId)" :key="s.uuid" class="row small">
                <span class="badge" :class="s.verdict.kind === 'pass' ? 'badge--ok' : 'badge--shu'">第 {{ s.strokeIndex + 1 }} 筆 {{ KIND_TEXT[s.verdict.kind] }}</span>
                <span class="faint num grow">{{ s.pointerType === 'pen' ? '筆' : '手指' }} · {{ { trace: '描摹', hint: '提示', blank: '空白' }[s.difficulty] }} · {{ new Date(s.recordedAt).toLocaleTimeString('zh-TW', { hour12: false }) }}<template v-if="s.judgedCorrect === false"> · 已標記誤判</template></span>
                <button class="icon-btn" type="button" aria-label="刪除這筆樣本" @click="deleteOne(s.uuid)"><AppIcon name="x" size="sm" /></button>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <div class="stack">
        <button class="btn btn--primary btn--block" type="button" :disabled="!samples.length" @click="exportSamples"><AppIcon name="download" size="sm" />匯出筆跡樣本</button>
        <button class="btn btn--danger btn--block" type="button" :disabled="!samples.length" @click="confirm = 'all'"><AppIcon name="trash" size="sm" />刪除全部樣本</button>
      </div>
    </main>

    <ConfirmSheet :open="confirm === 'all'" :title="`刪除全部 ${samples.length} 筆樣本？`" @close="confirm = null">
      <p class="muted">刪除後無法復原。若之後想用這些樣本做測試，請先匯出。</p>
      <button class="btn btn--danger-fill btn--block btn--lg" type="button" @click="deleteAll">刪除全部</button>
      <button class="btn btn--secondary btn--block" type="button" @click="confirm = null">取消</button>
    </ConfirmSheet>
    <ConfirmSheet :open="confirm === 'off'" title="關閉調校模式" @close="confirm = null">
      <p class="muted">要一併刪除已保存的 {{ samples.length }} 筆筆跡嗎？</p>
      <button class="btn btn--danger-fill btn--block btn--lg" type="button" @click="turnOff(true)">關閉並刪除筆跡</button>
      <button class="btn btn--secondary btn--block" type="button" @click="turnOff(false)">只關閉，保留筆跡</button>
      <button class="btn btn--ghost btn--block" type="button" @click="confirm = null">取消</button>
    </ConfirmSheet>

  </div>
</template>

<style scoped>
.sample-list {
  list-style: none;
  margin: 0;
  padding: 0 var(--sp-4) var(--sp-2) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  border-top: 1px dashed var(--c-line);
}
</style>
