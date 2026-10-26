<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { kanaCardId, loadKanaPack, type KanaItem, type KanaScript, type KanaSkill } from '@/core/content/kana'
import { db } from '@/core/db'
import { markKnown } from '@/core/srs/repository'
import type { CardRecord } from '@/core/srs/types'
import { useToast } from '@/core/ui/useToast'

/**
 * 標記已會（規劃書 F6、§6.2；docs/ui-mockups/mark-known.html）：
 * 以卡片（含技能）為單位；預設暫停排程，另有「偶爾複習」。
 */
const router = useRouter()
const items = ref<KanaItem[]>([])
const cards = ref<Map<string, CardRecord>>(new Map())
const script = ref<KanaScript>('hiragana')
const skill = ref<KanaSkill>('read')
const mode = ref<'suspend' | 'occasional'>('suspend')
const selected = ref<Set<string>>(new Set())
const busy = ref(false)
const { toast, show } = useToast()

const SKILL_TEXT: Record<KanaSkill, string> = { read: '讀', write: '寫' }

const rows = computed(() => {
  const map = new Map<string, KanaItem[]>()
  for (const i of items.value) {
    if (i.script !== script.value) continue
    if (!i.skills.includes(skill.value)) continue
    map.set(i.row, [...(map.get(i.row) ?? []), i])
  }
  return [...map.entries()]
})

function stateOf(item: KanaItem): 'known' | 'started' | 'new' {
  const c = cards.value.get(kanaCardId(item.char, skill.value))
  if (!c) return 'new'
  if (c.suspended) return 'known'
  return c.reps > 0 ? 'started' : 'new'
}

function toggle(item: KanaItem) {
  const s = new Set(selected.value)
  if (s.has(item.char)) s.delete(item.char)
  else s.add(item.char)
  selected.value = s
}
function toggleRow(list: KanaItem[]) {
  const s = new Set(selected.value)
  const all = list.every((i) => s.has(i.char))
  for (const i of list) {
    if (all) s.delete(i.char)
    else s.add(i.char)
  }
  selected.value = s
}
function selectAll() {
  const s = new Set<string>()
  for (const [, list] of rows.value) for (const i of list) if (stateOf(i) !== 'known') s.add(i.char)
  selected.value = s
}

async function load() {
  const pack = await loadKanaPack()
  items.value = pack.items
  cards.value = new Map((await db.cards.toArray()).map((c) => [c.id, c]))
}

async function submit() {
  if (!selected.value.size) return
  busy.value = true
  try {
    await markKnown([...selected.value].map((ch) => kanaCardId(ch, skill.value)), mode.value)
    show(`已標記 ${selected.value.size} 個假名的「${SKILL_TEXT[skill.value]}」為已會`)
    selected.value = new Set()
    await load()
    setTimeout(() => router.push('/'), 800)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="app">
    <AppTopbar title="標記已會" back="/kana" />

    <main class="page" style="gap: var(--sp-5); padding-bottom: 96px">
      <div class="banner">
        <AppIcon name="info" size="sm" />
        <div>已經會的假名可以跳過。讀和寫分開標記，例如<strong style="display: inline">會念但還不會寫</strong>，就只標記「讀」。</div>
      </div>

      <section class="stack">
        <h2 class="section-title">要標記的技能</h2>
        <div class="segmented">
          <button type="button" :aria-pressed="skill === 'read'" @click="skill = 'read'; selected = new Set()">讀（看字讀音）</button>
          <button type="button" :aria-pressed="skill === 'write'" @click="skill = 'write'; selected = new Set()">寫（手寫）</button>
        </div>
        <div class="segmented">
          <button type="button" :aria-pressed="script === 'hiragana'" @click="script = 'hiragana'; selected = new Set()">平假名</button>
          <button type="button" :aria-pressed="script === 'katakana'" @click="script = 'katakana'; selected = new Set()">片假名</button>
        </div>
      </section>

      <section class="stack">
        <h2 class="section-title">選擇假名<button class="btn btn--ghost btn--sm" type="button" style="min-height: 28px; padding: 0" @click="selectAll">全選未標記</button></h2>
        <div class="card stack" lang="ja">
          <div v-for="[row, list] in rows" :key="row" class="row-pick">
            <button class="chip" type="button" :aria-pressed="list.every((i) => selected.has(i.char))" @click="toggleRow(list)">{{ row }}</button>
            <div class="kana-table" style="gap: 6px">
              <button
                v-for="i in list"
                :key="i.id"
                type="button"
                class="kana-cell"
                :class="{ 'is-selected': selected.has(i.char), 'is-known': stateOf(i) === 'known' && !selected.has(i.char) }"
                :aria-pressed="selected.has(i.char)"
                :aria-label="`${i.char}${stateOf(i) === 'known' ? '（已標記）' : ''}`"
                @click="toggle(i)"
              >
                <span v-if="selected.has(i.char)" class="check"><AppIcon name="check" /></span>
                <span class="k" style="font-size: 1.25rem">{{ i.char }}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="legend">
          <span><i style="background: var(--c-surface-2); border-color: transparent"></i>已標記已會</span>
          <span><i style="background: var(--c-primary-soft); border-color: var(--c-primary)"></i>這次要標記</span>
        </div>
      </section>

      <section class="stack">
        <h2 class="section-title">標記後</h2>
        <ul class="list">
          <li>
            <label class="list-row">
              <div class="list-row__main"><div class="list-row__title">不再出現在每日學習</div><div class="list-row__sub">暫停排程。之後可在假名詳細頁恢復</div></div>
              <input v-model="mode" type="radio" value="suspend" style="width: 20px; height: 20px; accent-color: var(--c-primary)" />
            </label>
          </li>
          <li>
            <label class="list-row">
              <div class="list-row__main"><div class="list-row__title">偶爾複習</div><div class="list-row__sub">約 3 個月後出現一次，確認沒忘記</div></div>
              <input v-model="mode" type="radio" value="occasional" style="width: 20px; height: 20px; accent-color: var(--c-primary)" />
            </label>
          </li>
        </ul>
      </section>
    </main>

    <div class="sticky-foot">
      <button class="btn btn--primary btn--lg btn--block" type="button" :disabled="!selected.size || busy" @click="submit">
        標記 {{ selected.size }} 個假名的「{{ SKILL_TEXT[skill] }}」為已會
      </button>
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.row-pick {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: var(--sp-2);
  align-items: center;
}
.row-pick + .row-pick {
  margin-top: var(--sp-2);
}
.row-pick .kana-table {
  grid-template-columns: repeat(5, 1fr);
}
.sticky-foot {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: var(--sp-3) var(--sp-4) calc(var(--safe-bottom) + var(--sp-4));
  background: linear-gradient(transparent, var(--c-paper) 30%);
}
</style>
