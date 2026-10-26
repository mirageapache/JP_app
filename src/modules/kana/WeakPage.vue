<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import JaText from '@/components/JaText.vue'
import { listHandwritingLogs } from '@/core/handwriting/repository'
import { weaknessScores, type WeakScore } from '@/core/stats/weakness'

/** 弱點專練（規劃書 F8、§6.2）：依 handwritingLogs 的弱點分數排序，不影響 FSRS */
const scores = ref<WeakScore[]>([])
const loading = ref(true)

onMounted(async () => {
  scores.value = weaknessScores(await listHandwritingLogs()).filter((s) => s.score > 0)
  loading.value = false
})
</script>

<template>
  <div class="app">
    <AppTopbar title="弱點專練" back="/kana" />
    <main class="page" style="gap: var(--sp-4)">
      <p class="small muted">依最近幾次手寫的重寫、提示、跳過情況計算弱點分數，越高越需要練。這裡的練習不影響複習排程。</p>
      <p v-if="loading" class="small faint" style="text-align: center">計算中…</p>
      <p v-else-if="scores.length === 0" class="small faint" style="text-align: center">目前沒有明顯的弱點。練習幾次之後，常寫錯的字會出現在這裡。</p>
      <ul v-else class="list">
        <li v-for="s in scores" :key="s.cardId">
          <RouterLink class="list-row" :to="`/kana/${encodeURIComponent(s.char)}`">
            <JaText :text="s.char" display style="font-size: 1.75rem; width: 36px; text-align: center; line-height: 1" />
            <div class="list-row__main stack" style="gap: 6px">
              <div class="row row--between small"><span class="muted">弱點分數</span><span class="num" :style="{ color: s.score >= 50 ? 'var(--c-shu)' : 'var(--c-ink-2)' }">{{ s.score }}</span></div>
              <div class="progress"><span :style="{ width: s.score + '%', background: s.score >= 50 ? 'var(--c-shu)' : 'var(--c-warn)' }"></span></div>
              <div class="caption faint num">練習 {{ s.attempts }} 次</div>
            </div>
            <AppIcon name="chev-r" size="sm" class="chev" />
          </RouterLink>
        </li>
      </ul>
    </main>
  </div>
</template>
