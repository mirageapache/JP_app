<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'

/** registerType: 'prompt'：有新版本時提示使用者重新載入（規劃書 §3、Q24）；學習中不打擾，離開 session 再顯示 */
const { needRefresh, updateServiceWorker } = useRegisterSW()
const route = useRoute()
</script>

<template>
  <div v-if="needRefresh && route.name !== 'session'" class="toast toast--update" :class="{ 'toast--flush': !route.meta.tabbar }" role="status">
    <span>有新版本可用</span>
    <button class="btn btn--sm" type="button" @click="updateServiceWorker()">更新</button>
    <button class="icon-btn" type="button" aria-label="稍後" @click="needRefresh = false">✕</button>
  </div>
</template>

<style scoped>
.toast--update {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding-right: var(--sp-1);
}
.toast--update .btn {
  color: var(--c-paper);
  background: color-mix(in srgb, var(--c-paper) 18%, transparent);
}
.toast--update .icon-btn {
  width: 36px;
  height: 36px;
  color: var(--c-paper);
}
</style>
