<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import JaText from '@/components/JaText.vue'
import RatingBar from '@/components/RatingBar.vue'
import { pickDistractors, shuffleWithSeed } from '@/core/content/distractors'
import type { KanaItem } from '@/core/content/kana'
import type { Rating } from '@/core/srs/types'
import { speakJa } from '@/core/tts'

/**
 * 辨識題（規劃書 F4）：看字選讀音。答對 → 建議「良好」；答錯 → 建議「重來」。
 * 使用者可改評分後再繼續（design-system：評分列附建議）。
 */
/** 統一的題型 props（見 cardRenderers.ts）；isNew 在辨識題用不到 */
const props = defineProps<{
  item: KanaItem
  pool: KanaItem[]
  isNew?: boolean
  intervals: Record<Rating, string>
  /** 本輪第幾次出現，用來變換選項順序 */
  attempt: number
  disabled?: boolean
}>()
const emit = defineEmits<{ rate: [rating: Rating, firstTry: boolean] }>()

const chosen = ref<string | null>(null)
const choices = computed(() => {
  const d = pickDistractors(props.item, props.pool, 3, props.attempt)
  return shuffleWithSeed([props.item, ...d], props.item.order * 31 + props.attempt)
})
const answered = computed(() => chosen.value !== null)
const correct = computed(() => chosen.value === props.item.romaji)
const suggested = computed<Rating>(() => (correct.value ? 3 : 1))

function choose(romaji: string) {
  if (answered.value) return
  chosen.value = romaji
  void speakJa(props.item.char).catch(() => {})
}

watch(() => props.item.id, () => (chosen.value = null))
</script>

<template>
  <div class="session-body">
    <span class="badge badge--primary">假名 · 讀音</span>
    <p class="prompt-label">這個假名怎麼念？</p>
    <JaText :text="item.char" display tag="div" class="prompt-kana" />
  </div>
  <footer class="session-foot">
    <div class="choices" role="group" aria-label="選項">
      <button
        v-for="c in choices"
        :key="c.id"
        class="choice"
        type="button"
        :class="{ 'is-correct': answered && c.romaji === item.romaji, 'is-wrong': answered && chosen === c.romaji && c.romaji !== item.romaji }"
        :disabled="answered"
        @click="choose(c.romaji)"
      >
        {{ c.romaji }}
        <AppIcon v-if="answered && c.romaji === item.romaji" name="check" size="sm" class="mark" />
        <AppIcon v-else-if="answered && chosen === c.romaji" name="x" size="sm" class="mark" />
      </button>
    </div>
    <RatingBar v-if="answered" :intervals="intervals" :suggested="suggested" :disabled="disabled" :note="correct ? '答對了，點選評分繼續' : '答錯了，這張卡稍後會再出現'" @rate="(r) => emit('rate', r, correct)" />
  </footer>
</template>
