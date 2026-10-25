<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppTabbar from '@/components/AppTabbar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { kanaCardId, kanaTable, loadKanaPack, type KanaGroup, type KanaItem, type KanaPack, type KanaScript } from '@/core/content/kana'
import { db } from '@/core/db'

/**
 * 50 音表（規劃書 F1、§6.4）。P1a：顯示字與羅馬字、練習次數；學習狀態（已熟／弱點）於 P1b 加入 SRS 後顯示。
 */
const pack = ref<KanaPack | null>(null)
const script = ref<KanaScript>('hiragana')
const group = ref<KanaGroup>('seion')
const practiced = ref<Map<string, number>>(new Map())
const error = ref('')

const SCRIPT_LABEL: Record<KanaScript, string> = { hiragana: '平假名', katakana: '片假名' }
const GROUPS: { id: KanaGroup; label: string }[] = [
  { id: 'seion', label: '清音' },
  { id: 'dakuon', label: '濁音・半濁音' },
  { id: 'youon', label: '拗音' },
  { id: 'small', label: '小寫' },
]

const table = computed<(KanaItem | null)[][]>(() => {
  if (!pack.value) return []
  const items = pack.value.items
  if (group.value === 'dakuon') {
    return [...kanaTable(items, script.value, 'dakuon'), ...kanaTable(items, script.value, 'handakuon')]
  }
  if (group.value === 'seion') return kanaTable(items, script.value, 'seion')
  // 拗音：每行 3 個；小寫：一列
  const list = items.filter((i) => i.script === script.value && i.group === group.value)
  if (group.value === 'youon') {
    const rows = new Map<string, KanaItem[]>()
    for (const i of list) rows.set(i.row, [...(rows.get(i.row) ?? []), i])
    return [...rows.values()]
  }
  return [list]
})
const columns = computed(() => (group.value === 'youon' ? 3 : group.value === 'small' ? 5 : 5))

async function load() {
  try {
    pack.value = await loadKanaPack()
    const logs = await db.handwritingLogs.toArray()
    const counts = new Map<string, number>()
    for (const l of logs) counts.set(l.cardId, (counts.get(l.cardId) ?? 0) + 1)
    practiced.value = counts
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function count(item: KanaItem) {
  return practiced.value.get(kanaCardId(item.char, 'write')) ?? 0
}

onMounted(load)
</script>

<template>
  <div class="app has-tabbar">
    <AppTopbar title="假名" large />

    <main class="page" style="gap: var(--sp-4)">
      <div class="segmented" role="tablist" aria-label="假名種類">
        <button v-for="s in (['hiragana', 'katakana'] as const)" :key="s" type="button" role="tab" :aria-pressed="script === s" @click="script = s">
          {{ SCRIPT_LABEL[s] }}
        </button>
      </div>

      <div class="chips" aria-label="分類">
        <button v-for="g in GROUPS" :key="g.id" class="chip" type="button" :aria-pressed="group === g.id" @click="group = g.id">{{ g.label }}</button>
      </div>

      <p v-if="error" class="banner banner--shu">{{ error }}</p>

      <div v-else-if="pack" class="kana-table" lang="ja" :style="{ gridTemplateColumns: `repeat(${columns}, 1fr)` }">
        <template v-for="(row, r) in table" :key="r">
          <template v-for="(item, c) in row" :key="`${r}-${c}`">
            <RouterLink
              v-if="item"
              class="kana-cell"
              :class="{ 'is-new': count(item) === 0 }"
              :to="`/kana/${encodeURIComponent(item.char)}`"
              :aria-label="`${item.char}（${item.romaji}）`"
            >
              <span class="k">{{ item.char }}</span>
              <span class="r">{{ item.romaji }}</span>
            </RouterLink>
            <span v-else class="kana-cell is-empty" />
          </template>
        </template>
      </div>

      <div class="legend">
        <span><i style="border-style: dashed; background: var(--c-paper)"></i>未練習</span>
        <span><i style="background: var(--c-surface)"></i>練習過</span>
      </div>
      <p class="small faint" style="padding: 0 var(--sp-1)">點任一假名可看筆順並自由練習。學習狀態（已熟、弱點）會在每日學習功能加入後顯示。</p>
    </main>

    <AppTabbar />
  </div>
</template>
