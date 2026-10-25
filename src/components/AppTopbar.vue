<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{
  title: string
  /** 大標題靠左（分頁的根頁面）；否則置中（子頁面） */
  large?: boolean
  /** 顯示返回按鈕，值為返回的路由位置 */
  back?: string
  /** 標題為日文時標示 lang="ja"（規劃書 §6.6） */
  titleLang?: string
}>()
</script>

<template>
  <header class="topbar">
    <RouterLink v-if="back" class="icon-btn" :to="back" aria-label="返回">
      <AppIcon name="chev-l" />
    </RouterLink>
    <h1 class="topbar__title" :class="{ 'topbar__title--left': large }" :lang="titleLang">{{ title }}</h1>
    <slot name="actions">
      <span v-if="back" class="spacer" />
    </slot>
  </header>
</template>
