<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import JaText from '@/components/JaText.vue'
import { useDailySession } from '@/core/srs/useDailySession'
import { getCard } from '@/core/srs/repository'
import { previewIntervals } from '@/core/srs/fsrs'
import type { Rating } from '@/core/srs/types'
import RecognizeCard from './RecognizeCard.vue'
import WriteCard from './WriteCard.vue'

/** 每日學習（規劃書 §6.2、design-system §5.3）：全螢幕，頂部關閉與進度，底部作答／評分 */
const session = useDailySession()
const intervals = ref<Record<Rating, string>>({ 1: '', 2: '', 3: '', 4: '' })
const attempts = ref<Map<string, number>>(new Map())

const currentItem = computed(() => (session.current.value ? session.itemOf(session.current.value) : undefined))
const pool = computed(() => [...session.items.value.values()])
const attempt = computed(() => attempts.value.get(session.current.value?.cardId ?? '') ?? 0)
const total = computed(() => session.counters.value.total)
const done = computed(() => session.counters.value.done)

watch(
  session.current,
  async (entry) => {
    if (!entry) return
    const card = await getCard(entry.cardId)
    intervals.value = previewIntervals(card, Date.now())
    attempts.value.set(entry.cardId, (attempts.value.get(entry.cardId) ?? 0) + 1)
  },
  { immediate: true },
)

async function rate(rating: Rating, firstTry: boolean) {
  await session.answer(rating, firstTry)
}

const accuracy = computed(() => {
  const c = session.counters.value
  return c.done ? Math.round((100 * c.correctFirstTry) / c.done) : 0
})

onMounted(() => session.start())
</script>

<template>
  <div class="app session">
    <header class="session-top">
      <RouterLink class="icon-btn" to="/" aria-label="結束學習"><AppIcon name="x" /></RouterLink>
      <div class="progress" role="progressbar" :aria-valuenow="done" :aria-valuemax="total"><span :style="{ width: `${total ? (100 * done) / total : 0}%` }"></span></div>
      <span class="count num">{{ done }} / {{ total }}</span>
    </header>

    <!-- 進行中 -->
    <template v-if="session.current.value && currentItem">
      <RecognizeCard
        v-if="session.current.value.skill === 'read'"
        :key="session.current.value.cardId + attempt"
        :item="currentItem"
        :pool="pool"
        :intervals="intervals"
        :attempt="attempt"
        @rate="rate"
      />
      <WriteCard
        v-else
        :key="session.current.value.cardId + attempt"
        :item="currentItem"
        :is-new="session.current.value.kind === 'new'"
        :intervals="intervals"
        @rate="rate"
      />
    </template>

    <!-- 沒有題目 -->
    <main v-else-if="session.finished.value && total === 0" class="page" style="justify-content: center; text-align: center">
      <p style="font-size: var(--fs-title)">今天沒有要複習的卡片</p>
      <p class="muted">可以到「假名」自由練習，或在首頁按「今天想多學一點」。</p>
      <RouterLink class="btn btn--primary btn--lg btn--block" to="/">回到今日</RouterLink>
    </main>

    <!-- 完成 -->
    <main v-else-if="session.finished.value" class="page" style="padding-top: var(--sp-6)">
      <section class="stack" style="align-items: center; text-align: center; gap: var(--sp-2)">
        <div style="width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: var(--c-ok-soft); color: var(--c-ok)">
          <AppIcon name="check" style="width: 36px; height: 36px; stroke-width: 2.4" />
        </div>
        <h1 style="font-size: var(--fs-title-lg)">今天的學習完成了</h1>
      </section>
      <section class="stat-grid">
        <div class="stat"><div class="stat__value num">{{ total }}</div><div class="stat__label">題數</div></div>
        <div class="stat"><div class="stat__value num">{{ accuracy }}<span class="small">%</span></div><div class="stat__label">一次答對</div></div>
        <div class="stat"><div class="stat__value num">{{ Math.round(session.counters.value.elapsedMs / 60000) }}<span class="small"> 分</span></div><div class="stat__label">用時</div></div>
      </section>
      <section v-if="session.wrongItems.value.length" class="stack">
        <h2 class="section-title">這次答錯的</h2>
        <div class="chips" style="flex-wrap: wrap">
          <RouterLink v-for="id in session.wrongItems.value" :key="id" class="chip" :to="`/kana/${encodeURIComponent(id.replace('kana:', ''))}`">
            <JaText :text="id.replace('kana:', '')" display style="font-size: 1.125rem" />
          </RouterLink>
        </div>
        <p class="small faint">它們會在幾分鐘到一天內再出現一次。</p>
      </section>
      <RouterLink class="btn btn--primary btn--lg btn--block" to="/">回到今日</RouterLink>
    </main>

    <main v-else class="page" style="justify-content: center; text-align: center">
      <p v-if="session.error.value" class="banner banner--shu">{{ session.error.value }}</p>
      <p v-else class="muted">正在準備今天的題目…</p>
    </main>
  </div>
</template>
