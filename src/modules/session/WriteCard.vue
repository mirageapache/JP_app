<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import RatingBar from '@/components/RatingBar.vue'
import WritingBox from '@/components/WritingBox.vue'
import type { KanaItem } from '@/core/content/kana'
import { kanaCardId } from '@/core/content/kana'
import type { Difficulty } from '@/core/handwriting/types'
import { GRADE_TO_RATING } from '@/core/handwriting/session'
import { useWritingPractice } from '@/core/handwriting/useWritingPractice'
import type { Rating } from '@/core/srs/types'
import { speakJa } from '@/core/tts'

/**
 * 手寫題（規劃書 F3、§6.1）：看音寫字。新卡用描摹、複習用空白；
 * 完成後由手寫結果建議評分，使用者可調整。
 */
const props = defineProps<{
  item: KanaItem
  isNew: boolean
  intervals: Record<Rating, string>
  /** 本輪第幾次出現；答錯重出時改用提示模式 */
  attempt?: number
  disabled?: boolean
}>()
const emit = defineEmits<{ rate: [rating: Rating, firstTry: boolean] }>()

const char = computed(() => props.item.char)
const cardId = computed(() => kanaCardId(props.item.char, 'write'))
function pick(): Difficulty {
  if (props.isNew) return 'trace'
  return (props.attempt ?? 1) > 1 ? 'hint' : 'blank'
}
const difficulty = ref<Difficulty>(pick())
const box = ref<InstanceType<typeof WritingBox>>()
const practice = useWritingPractice({ char, cardId, difficulty, mode: 'session' })

const suggested = computed<Rating | null>(() => (practice.summary.value ? GRADE_TO_RATING[practice.summary.value.rating] : null))

watch(practice.lastWrongPoints, (pts) => {
  if (pts) box.value?.flashWrong(pts)
})
watch(
  () => props.item.id,
  () => {
    difficulty.value = pick()
  },
)

function speak() {
  void speakJa(props.item.char).catch(() => {})
}
</script>

<template>
  <div class="session-body" style="justify-content: flex-start; gap: var(--sp-3)">
    <div class="row" style="gap: var(--sp-2)">
      <span class="badge badge--primary">假名 · 書寫</span>
      <span class="badge">{{ { trace: '描摹', hint: '提示', blank: '空白' }[difficulty] }}</span>
    </div>
    <div class="row" style="gap: var(--sp-2)">
      <p class="prompt-word" style="font-weight: 600">{{ item.romaji }}</p>
      <button class="icon-btn icon-btn--filled" type="button" aria-label="播放讀音" @click="speak"><AppIcon name="volume" /></button>
    </div>

    <WritingBox
      ref="box"
      :template="practice.template.value"
      :show-ghost="difficulty === 'trace'"
      :accepted="practice.session.value.accepted"
      :hint-index="practice.hintIndex.value"
      :guide-index="practice.guideIndex.value"
      :disabled="practice.finished.value"
      @stroke="practice.onStroke"
    />

    <div class="feedback" :class="`feedback--${practice.feedback.value.kind}`" aria-live="polite">
      <AppIcon v-if="practice.feedback.value.kind === 'ok'" name="check" size="sm" />
      <AppIcon v-else-if="practice.feedback.value.kind === 'shu'" name="x" size="sm" />
      {{ practice.feedback.value.text }}
    </div>
  </div>

  <footer class="session-foot">
    <RatingBar
      v-if="practice.summary.value && suggested"
      :intervals="intervals"
      :suggested="suggested"
      :disabled="disabled"
      :note="practice.summary.value.skipped ? '已跳過，建議「重來」' : `重寫 ${practice.summary.value.misses} 次，建議${['', '重來', '困難', '良好', '簡單'][suggested]}`"
      @rate="(r) => emit('rate', r, practice.summary.value!.misses === 0 && !practice.summary.value!.skipped)"
    />
    <div v-else class="row" style="justify-content: space-between">
      <button class="btn btn--secondary btn--sm" type="button" @click="practice.reset()"><AppIcon name="undo" size="sm" />重寫</button>
      <button class="btn btn--ghost btn--sm" type="button" @click="practice.skip()"><AppIcon name="skip" size="sm" />跳過</button>
    </div>
  </footer>
</template>
