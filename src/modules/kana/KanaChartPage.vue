<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTabbar from '@/components/AppTabbar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { kanaCardId, kanaTable, loadKanaPack, type KanaGroup, type KanaItem, type KanaPack, type KanaScript } from '@/core/content/kana'
import { practiceCountByCard } from '@/core/handwriting/repository'
import { errorMessage } from '@/core/util/errors'

/**
 * 50 音表（規劃書 F1、§6.4）：顯示字與羅馬字、練習次數（練過的字外框實線）；弱點與對照另有專頁。
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
const columns = computed(() => (group.value === 'youon' ? 3 : 5))

async function load() {
  try {
    pack.value = await loadKanaPack()
    practiced.value = await practiceCountByCard()
  } catch (e) {
    error.value = errorMessage(e)
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

      <div class="stack">
        <h2 class="section-title">練習</h2>
        <ul class="list">
          <li>
            <RouterLink class="list-row" to="/kana/weak">
              <AppIcon name="target" style="color: var(--c-shu)" />
              <div class="list-row__main"><div class="list-row__title">弱點專練</div><div class="list-row__sub">常寫錯的字排在前面</div></div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
          <li>
            <RouterLink class="list-row" to="/kana/confusables">
              <AppIcon name="shuffle" style="color: var(--c-primary)" />
              <div class="list-row__main"><div class="list-row__title">易混淆對照</div><div class="list-row__sub" lang="ja">ぬ／め、シ／ツ、ソ／ン…</div></div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
          <li>
            <RouterLink class="list-row" to="/kana/mark-known">
              <AppIcon name="check" style="color: var(--c-ink-2)" />
              <div class="list-row__main"><div class="list-row__title">標記已會</div><div class="list-row__sub">跳過已經熟悉的字</div></div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
        </ul>
      </div>
      <p class="small faint" style="padding: 0 var(--sp-1)">點任一假名可看筆順並自由練習。自由練習不影響複習排程。</p>
    </main>

    <AppTabbar />
  </div>
</template>
