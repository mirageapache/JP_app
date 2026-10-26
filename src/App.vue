<script setup lang="ts">
import IconSprite from '@/components/IconSprite.vue'
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue'
import { dbStatus } from '@/core/db/status'
</script>

<template>
  <IconSprite />
  <div v-if="dbStatus.error" class="db-error" role="alert">
    <strong>無法開啟本機資料庫</strong>，進度無法儲存。請關閉私密瀏覽、確認儲存空間，或完全關閉 App 後重開。
    <div class="caption faint" style="margin-top: 4px; word-break: break-all">{{ dbStatus.error }}</div>
  </div>
  <RouterView />
  <PwaUpdatePrompt />
</template>

<style scoped>
.db-error {
  position: sticky;
  top: var(--safe-top, 0px);
  z-index: 50;
  padding: var(--sp-3) var(--sp-4);
  background: var(--c-shu-soft);
  color: var(--c-ink);
  font-size: var(--fs-small);
  border-bottom: 1px solid var(--c-line);
}
</style>
