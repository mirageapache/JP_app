<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import StrokeOrderAnimation from '@/components/StrokeOrderAnimation.vue'
import WritingBox from '@/components/WritingBox.vue'
import { findKana, kanaCardId, type KanaItem } from '@/core/content/kana'
import { db } from '@/core/db'
import { useWritingPractice } from '@/core/handwriting/useWritingPractice'
import type { Difficulty } from '@/core/handwriting/types'
import { loadSettings, setSetting, settings } from '@/core/settings'
import { speakJa } from '@/core/tts'
import { useToast } from '@/core/ui/useToast'

/** 假名詳細頁（規劃書 F2、F3、§6.4）：筆順動畫、筆畫版本、自由手寫練習（不影響 FSRS） */
const route = useRoute()
const char = computed(() => decodeURIComponent(String(route.params.char ?? '')))
const item = ref<KanaItem | null>(null)
const difficulty = ref<Difficulty>('trace')
const recentCount = ref(0)
const order = ref<InstanceType<typeof StrokeOrderAnimation>>()
const box = ref<InstanceType<typeof WritingBox>>()
const { toast, show } = useToast()

const cardId = computed(() => kanaCardId(char.value, 'write'))
const canWrite = computed(() => item.value?.skills.includes('write') ?? false)
const variants = computed(() => item.value?.strokeVariants ?? [])
const variantId = computed(() => settings.kanaStrokeVariants[char.value] ?? variants.value.find((v) => v.default)?.id ?? 'kanjivg')

const practice = useWritingPractice({ char, cardId, difficulty, variantId, mode: 'free', enabled: canWrite })

const RATING_TEXT = { again: '重來', hard: '困難', good: '良好', easy: '簡單' } as const

async function load() {
  await loadSettings()
  item.value = (await findKana(char.value)) ?? null
  recentCount.value = await db.handwritingLogs.where('cardId').equals(cardId.value).count()
}

async function chooseVariant(id: string) {
  await setSetting('kanaStrokeVariants', { ...settings.kanaStrokeVariants, [char.value]: id })
  show(variants.value.find((v) => v.id === id)?.strokes === null ? '這個寫法的筆畫資料尚未提供，暫以預設版本判定' : '已切換筆畫版本')
}

async function flagWrong() {
  show((await practice.flagLastSampleWrong()) ? '已標記判定有誤' : '還沒有可標記的筆跡')
}

async function speak() {
  try {
    await speakJa(char.value)
  } catch (e) {
    show(e instanceof Error ? e.message : String(e))
  }
}

watch(practice.lastWrongPoints, (pts) => {
  if (pts) box.value?.flashWrong(pts)
})
watch(practice.finished, (done) => {
  if (done) void load()
})
watch(char, load)
onMounted(load)
</script>

<template>
  <div class="app">
    <AppTopbar :title="item?.row ?? '假名'" :title-lang="item ? 'ja' : undefined" back="/kana">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="播放讀音" @click="speak"><AppIcon name="volume" /></button>
      </template>
    </AppTopbar>

    <main class="page" style="gap: var(--sp-5)">
      <!-- 字與筆順 -->
      <section class="hero">
        <StrokeOrderAnimation v-if="canWrite" ref="order" class="hero__order" :template="practice.template.value" />
        <div class="stack" style="gap: var(--sp-2)">
          <div class="hero__big ja-display" lang="ja">{{ char }}</div>
          <div class="row" style="gap: var(--sp-2)">
            <strong>{{ item?.romaji }}</strong>
            <span v-if="item?.strokeCount" class="faint small">· {{ item.strokeCount }} 筆</span>
          </div>
          <button v-if="canWrite" class="btn btn--secondary btn--sm" type="button" @click="order?.play()"><AppIcon name="play" size="sm" />重播筆順</button>
          <p v-else class="small muted">拗音由兩個假名組成，請分別練習各自的寫法。</p>
        </div>
      </section>

      <p v-if="practice.loadError.value" class="banner banner--shu"><AppIcon name="alert" size="sm" />{{ practice.loadError.value }}</p>

      <!-- 筆畫版本 -->
      <section v-if="variants.length > 1" class="stack">
        <h2 class="section-title">筆畫版本<span class="caption faint">此字有其他常見寫法</span></h2>
        <ul class="list" role="radiogroup" aria-label="選擇筆畫版本">
          <li v-for="v in variants" :key="v.id">
            <label class="list-row">
              <div class="list-row__main">
                <div class="list-row__title">{{ v.label }}</div>
                <div v-if="v.strokes === null" class="list-row__sub">筆畫資料待補充</div>
              </div>
              <input type="radio" name="variant" :checked="variantId === v.id" style="width: 20px; height: 20px; accent-color: var(--c-primary)" @change="chooseVariant(v.id)" />
            </label>
          </li>
        </ul>
      </section>

      <!-- 自由練習 -->
      <section v-if="canWrite" class="stack">
        <div class="row row--between">
          <h2 class="section-title" style="padding: 0">自由練習<span class="caption faint">不影響複習排程</span></h2>
          <div class="segmented" style="width: 150px">
            <button type="button" :aria-pressed="difficulty === 'trace'" @click="difficulty = 'trace'">描摹</button>
            <button type="button" :aria-pressed="difficulty === 'blank'" @click="difficulty = 'blank'">空白</button>
          </div>
        </div>

        <WritingBox
          ref="box"
          :template="practice.template.value"
          :show-ghost="difficulty === 'trace'"
          :accepted="practice.session.value.accepted"
          :hint-index="practice.hintIndex.value"
          :disabled="practice.finished.value"
          @stroke="practice.onStroke"
        />

        <div class="feedback" :class="`feedback--${practice.feedback.value.kind}`" aria-live="polite">
          <AppIcon v-if="practice.feedback.value.kind === 'ok'" name="check" size="sm" />
          <AppIcon v-else-if="practice.feedback.value.kind === 'shu'" name="x" size="sm" />
          {{ practice.feedback.value.text }}
        </div>

        <div v-if="practice.summary.value" class="card stack" style="gap: var(--sp-2)">
          <div class="row row--between">
            <strong>完成</strong>
            <span class="badge badge--primary">若為複習：{{ RATING_TEXT[practice.summary.value.rating] }}</span>
          </div>
          <div class="small muted num">
            重寫 {{ practice.summary.value.misses }} 次 · 提示 {{ practice.summary.value.hintsUsed }} 次 · {{ (practice.summary.value.durationMs / 1000).toFixed(1) }} 秒
            {{ practice.summary.value.skipped ? '· 已跳過' : '' }}
          </div>
          <div class="row" style="gap: var(--sp-2)">
            <button class="btn btn--primary grow" type="button" @click="practice.reset()">再寫一次</button>
            <button v-if="settings.tuningMode" class="btn btn--secondary" type="button" @click="flagWrong"><AppIcon name="flag" size="sm" />判定有誤</button>
          </div>
        </div>

        <div v-else class="row" style="justify-content: space-between">
          <button class="btn btn--secondary btn--sm" type="button" @click="practice.reset()"><AppIcon name="undo" size="sm" />重寫</button>
          <button v-if="settings.tuningMode" class="btn btn--ghost btn--sm" type="button" @click="flagWrong">
            <AppIcon name="flag" size="sm" />判定有誤
          </button>
          <button class="btn btn--ghost btn--sm" type="button" @click="practice.skip()"><AppIcon name="skip" size="sm" />跳過</button>
        </div>

        <p class="small faint">這個字已練習 <span class="num">{{ recentCount }}</span> 次{{ settings.tuningMode ? ' · 調校模式開啟中，筆跡會保存' : '' }}</p>
      </section>
    </main>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}
.hero__order {
  width: 168px;
  flex: none;
}
.hero__big {
  font-size: 7rem;
  line-height: 1;
}
</style>
