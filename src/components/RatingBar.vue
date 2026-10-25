<script setup lang="ts">
import type { Rating } from '@/core/srs/types'

/** 評分列（design-system §6）：四個等寬按鈕，上方評分名稱、下方下次間隔；建議的評分有實心外框 */
defineProps<{
  intervals: Record<Rating, string>
  suggested?: Rating | null
  note?: string
}>()
const emit = defineEmits<{ rate: [rating: Rating] }>()

const LABELS: { rating: Rating; cls: string; text: string }[] = [
  { rating: 1, cls: 'again', text: '重來' },
  { rating: 2, cls: 'hard', text: '困難' },
  { rating: 3, cls: 'good', text: '良好' },
  { rating: 4, cls: 'easy', text: '簡單' },
]
</script>

<template>
  <div class="stack" style="gap: var(--sp-2)">
    <p v-if="note" class="rating-note">{{ note }}</p>
    <div class="rating" role="group" aria-label="評分">
      <button v-for="l in LABELS" :key="l.rating" :class="[l.cls, { 'is-suggested': suggested === l.rating }]" type="button" @click="emit('rate', l.rating)">
        {{ l.text }}<small>{{ intervals[l.rating] }}</small>
      </button>
    </div>
  </div>
</template>
