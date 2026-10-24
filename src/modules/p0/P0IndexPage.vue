<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import type { IconName } from '@/components/icons'

/** P0 驗證項目（docs/development-phases.md「P0 驗證清單」） */
const items: { to?: string; title: string; sub: string; icon: IconName; phase: string }[] = [
  { to: '/settings/debug', title: '除錯面板', sub: 'console 輸出與未捕捉錯誤', icon: 'bug', phase: '可測' },
  { to: '/p0/handwriting', title: '手寫原型', sub: '田字格、逐筆判定、手指與 Apple Pencil', icon: 'pencil', phase: '可測' },
  { to: '/p0/firebase', title: 'Firebase', sub: '登入、隔天仍登入、離線後上傳', icon: 'cloud', phase: '待設定' },
  { title: '裝置能力', sub: 'TTS、持久儲存、安裝狀態', icon: 'wifi', phase: '製作中' },
  { title: 'UI 函式庫試做', sub: 'Vant 4 與 Konsta UI 各一頁', icon: 'layers', phase: '製作中' },
]
</script>

<template>
  <div class="app">
    <AppTopbar title="P0 驗證" back="/" />
    <main class="page">
      <p class="small muted">在 iPhone 主畫面 App 上逐項操作，結果回報後再進入 P1a。</p>
      <ul class="list">
        <li v-for="it in items" :key="it.title">
          <component :is="it.to ? 'RouterLink' : 'div'" class="list-row" :to="it.to">
            <AppIcon :name="it.icon" />
            <div class="list-row__main">
              <div class="list-row__title">{{ it.title }}</div>
              <div class="list-row__sub">{{ it.sub }}</div>
            </div>
            <span class="badge" :class="it.to ? 'badge--primary' : ''">{{ it.phase }}</span>
            <AppIcon v-if="it.to" name="chev-r" size="sm" class="chev" />
          </component>
        </li>
      </ul>
    </main>
  </div>
</template>
