<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import AppTabbar from '@/components/AppTabbar.vue'
import AppTopbar from '@/components/AppTopbar.vue'

const version = __APP_VERSION__
</script>

<template>
  <div class="app has-tabbar">
    <AppTopbar title="設定" large />
    <main class="page">
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">進階</h2>
        <ul class="list">
          <li>
            <RouterLink class="list-row" to="/p0">
              <AppIcon name="check" />
              <div class="list-row__main">P0 驗證清單</div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <p class="caption faint" style="text-align: center">
        日語練習帳 {{ version }}
      </p>
    </main>
    <AppTabbar />
  </div>
</template>
