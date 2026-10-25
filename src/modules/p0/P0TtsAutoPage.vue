<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { isTtsSupported } from '@/core/tts'

/**
 * P0 TTS 自動播放測試：頁面一出現就自動朗讀，不經過任何點擊。
 * - 從裝置能力頁點連結進來 → 模擬「換到下一張聽力卡時自動播放」
 * - 在這頁按「重新載入」→ 頁面完全沒有使用者互動，模擬 App 剛開啟就播放
 * iOS 被擋時通常不會觸發 onerror，所以用「2 秒內有沒有開始播放」判斷。
 */
const route = useRoute()
const mode = route.query.cold ? '重新載入後（完全沒有點擊）' : '換頁後（之前點過連結）'
const status = ref('準備播放…')
const result = ref<'playing' | 'done' | 'blocked' | 'error' | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

function play() {
  if (!isTtsSupported()) {
    status.value = '此裝置不支援語音合成'
    result.value = 'error'
    return
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance('みず')
  u.lang = 'ja-JP'
  u.rate = 0.9
  let started = false
  u.onstart = () => {
    started = true
    result.value = 'playing'
    status.value = '播放中…'
  }
  u.onend = () => {
    result.value = 'done'
    status.value = '程式判斷：已自動播放完畢'
  }
  u.onerror = (e) => {
    result.value = 'error'
    status.value = `程式判斷：播放失敗（${e.error}）`
  }
  speechSynthesis.speak(u)
  timer = setTimeout(() => {
    if (!started) {
      result.value = 'blocked'
      status.value = '程式判斷：2 秒內沒有開始播放，可能被 iOS 擋下'
    }
  }, 2000)
}

function reloadCold() {
  location.href = '/p0/tts-auto?cold=1'
}

onMounted(() => setTimeout(play, 600))
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="app">
    <AppTopbar title="自動播放測試" back="/p0/device" />
    <main class="page" style="gap: var(--sp-4)">
      <section class="card stack" style="gap: var(--sp-2)">
        <div class="row row--between small"><span class="muted">情境</span><span>{{ mode }}</span></div>
        <div class="row row--between small"><span class="muted">內容</span><span lang="ja">みず</span></div>
      </section>

      <div
        class="feedback"
        :class="result === 'done' || result === 'playing' ? 'feedback--ok' : result ? 'feedback--shu' : 'feedback--hint'"
        aria-live="polite"
      >
        {{ status }}
      </div>

      <p class="small muted">請以「耳朵實際有沒有聽到」為準記錄結果；程式判斷只是輔助。</p>

      <div class="stack">
        <button class="btn btn--primary btn--block" type="button" @click="reloadCold">重新載入此頁（測試完全沒有點擊的情況）</button>
        <RouterLink class="btn btn--secondary btn--block" to="/p0/device">回到裝置能力頁</RouterLink>
      </div>
    </main>
  </div>
</template>
