<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

/** 底部分頁列；尚未開發的分頁先不顯示（design-system.md §5.2） */
const tabs: { to: string; label: string; icon?: IconName; glyph?: string }[] = [
  { to: '/', label: '今日', icon: 'home' },
  { to: '/kana', label: '假名', glyph: 'あ' },
  { to: '/settings', label: '設定', icon: 'sliders' },
]
</script>

<template>
  <nav class="tabbar" aria-label="主要分頁" :style="{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }">
    <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" active-class="" exact-active-class="is-active">
      <span v-if="t.glyph" class="glyph" lang="ja">{{ t.glyph }}</span>
      <AppIcon v-else-if="t.icon" :name="t.icon" />
      {{ t.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar a.is-active {
  color: var(--c-primary);
}
</style>
