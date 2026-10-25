<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import AppTabbar from '@/components/AppTabbar.vue'
import { useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { useTapToReveal } from '@/core/debug/useTapToReveal'
import { loadSettings, settings } from '@/core/settings'
import { onMounted } from 'vue'

const version = __APP_VERSION__
const router = useRouter()
/** 連點版本號 5 次開啟除錯面板（規劃書 F16） */
const { tap } = useTapToReveal(5, () => router.push('/settings/debug'))
onMounted(loadSettings)
</script>

<template>
  <div class="app has-tabbar">
    <AppTopbar title="設定" large />
    <main class="page">
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">進階</h2>
        <ul class="list">
          <li>
            <RouterLink class="list-row" to="/settings/calibration">
              <AppIcon name="pencil" />
              <div class="list-row__main">
                <div class="list-row__title">手寫調校模式</div>
                <div class="list-row__sub">保存筆跡以調整判定門檻</div>
              </div>
              <span class="list-row__value">{{ settings.tuningMode ? '開啟' : '關閉' }}</span>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
          <li>
            <RouterLink class="list-row" to="/p0">
              <AppIcon name="check" />
              <div class="list-row__main">P0 驗證清單</div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <p class="caption faint" style="text-align: center; user-select: none" @click="tap">
        日語練習帳 {{ version }}
      </p>
    </main>
    <AppTabbar />
  </div>
</template>
