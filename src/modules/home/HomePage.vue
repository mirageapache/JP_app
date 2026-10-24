<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import AppTabbar from '@/components/AppTabbar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
</script>

<template>
  <div class="app has-tabbar">
    <AppTopbar title="今日" large>
      <template #actions>
        <RouterLink class="icon-btn" to="/settings" aria-label="設定"><AppIcon name="sliders" /></RouterLink>
      </template>
    </AppTopbar>

    <main class="page">
      <section class="banner">
        <AppIcon name="info" size="sm" />
        <div>
          <strong>P0 驗證階段</strong>
          每日學習功能會在 P1b 加入。目前請從下方進入 P0 的驗證頁面。
        </div>
      </section>

      <RouterLink class="btn btn--primary btn--lg btn--block" to="/p0">P0 驗證清單</RouterLink>
    </main>

    <AppTabbar />
  </div>
</template>
