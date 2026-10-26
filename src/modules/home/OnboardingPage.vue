<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { isStandalone } from '@/core/debug/deviceInfo'
import { loadSettings, setSetting } from '@/core/settings'

/** 首次開啟引導（規劃書 Q23；docs/ui-mockups/onboarding.html）：先加入主畫面，並警告刪除圖示會刪資料 */
const router = useRouter()
// 同步判斷，避免卡片先出現再消失
const standalone = ref(isStandalone())

async function finish(route: string) {
  await setSetting('onboardingDone', true)
  // 申請持久儲存（規劃書 §11）；結果不影響流程
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* 不支援時略過 */
  }
  router.replace(route)
}

onMounted(() => void loadSettings())
</script>

<template>
  <div class="app">
    <main class="page" style="padding-top: calc(var(--safe-top) + var(--sp-10)); gap: var(--sp-6)">
      <section class="stack" style="align-items: center; text-align: center; gap: var(--sp-3)">
        <div class="logo" aria-hidden="true"><span lang="ja">あ</span><i></i></div>
        <h1 style="font-size: var(--fs-title-lg)">日語練習帳</h1>
        <p class="muted">每天 10 分鐘，用手寫記住日文</p>
      </section>

      <section v-if="!standalone" class="card stack" style="gap: var(--sp-4)">
        <h2 style="font-size: var(--fs-callout)">先加入主畫面</h2>
        <p class="small muted">從主畫面開啟才能離線使用，學習紀錄也比較不會被系統清除。</p>
        <ol class="steps">
          <li><div>點 Safari 下方的分享按鈕<span class="ios-icon"><AppIcon name="share" /></span></div></li>
          <li><div>往下滑，選<span class="ios-icon"><AppIcon name="plus-sq" /></span>「加入主畫面」</div></li>
          <li><div>回到主畫面，點「日語練習帳」圖示開啟</div></li>
        </ol>
      </section>
      <section v-else class="card stack" style="gap: var(--sp-2)">
        <h2 style="font-size: var(--fs-callout)"><AppIcon name="check" size="sm" /> 已從主畫面開啟</h2>
        <p class="small muted">可以離線使用了。</p>
      </section>

      <div class="banner banner--warn">
        <AppIcon name="alert" size="sm" />
        <div><strong>刪除主畫面圖示，會一併刪除學習紀錄</strong>登入帳號後，紀錄會自動同步到雲端，換手機也能還原。</div>
      </div>

      <div class="stack">
        <button class="btn btn--primary btn--lg btn--block" type="button" @click="finish('/')">{{ standalone ? '開始使用' : '我已經從主畫面開啟' }}</button>
        <button v-if="!standalone" class="btn btn--ghost btn--block" type="button" @click="finish('/')">先在瀏覽器裡看看</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.logo {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 28px;
  background: var(--c-surface);
  border: 1.5px solid var(--c-line);
  display: grid;
  place-items: center;
}
.logo::before,
.logo::after {
  content: '';
  position: absolute;
  pointer-events: none;
}
.logo::before {
  left: 50%;
  top: 12px;
  bottom: 12px;
  border-left: 1px dashed var(--c-grid);
}
.logo::after {
  top: 50%;
  left: 12px;
  right: 12px;
  border-top: 1px dashed var(--c-grid);
}
.logo span {
  position: relative;
  font-family: var(--font-ja-display);
  font-size: 72px;
  line-height: 1;
  font-weight: 600;
}
.logo i {
  position: absolute;
  right: 18px;
  bottom: 16px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--c-shu);
}
.ios-icon {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--c-surface-2);
  vertical-align: middle;
  margin: 0 2px;
  color: var(--c-primary);
}
.ios-icon svg {
  width: 16px;
  height: 16px;
}
</style>
