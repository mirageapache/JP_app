<script setup lang="ts">
import AppTopbar from '@/components/AppTopbar.vue'
</script>

<template>
  <div class="app">
    <AppTopbar title="找不到頁面" back="/" />
    <main class="page">
      <p class="muted">這個頁面不存在。</p>
      <RouterLink class="btn btn--secondary" to="/">回到今日</RouterLink>
    </main>
  </div>
</template>
