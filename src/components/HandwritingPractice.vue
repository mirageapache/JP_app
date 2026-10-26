<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import WritingBox from '@/components/WritingBox.vue'
import type { Difficulty } from '@/core/handwriting/types'
import type { WritingPractice } from '@/core/handwriting/useWritingPractice'

/**
 * 田字格 + 回饋列 + 判錯閃紅的接線（design-system §7）。
 * 每日佇列的手寫題與假名詳細頁的自由練習共用；P2 單字手寫直接重用。
 */
const props = defineProps<{ practice: WritingPractice; difficulty: Difficulty }>()
const box = ref<InstanceType<typeof WritingBox>>()

watch(
  () => props.practice.lastWrongPoints.value,
  (pts) => {
    if (pts) box.value?.flashWrong(pts)
  },
)
</script>

<template>
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
</template>
