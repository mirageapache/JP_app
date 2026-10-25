<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AppTabbar from '@/components/AppTabbar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { useTapToReveal } from '@/core/debug/useTapToReveal'
import { loadSettings, setSetting, settings } from '@/core/settings'
import { refreshPending, syncState } from '@/core/sync/useSync'

const version = __APP_VERSION__
const router = useRouter()
/** 連點版本號 5 次開啟除錯面板（規劃書 F16） */
const { tap } = useTapToReveal(5, () => router.push('/settings/debug'))

function step(key: 'dailyNewKana' | 'dailyGoalMinutes' | 'newPauseThreshold', delta: number, min: number, max: number) {
  const next = Math.min(max, Math.max(min, settings[key] + delta))
  if (next !== settings[key]) void setSetting(key, next)
}

onMounted(() => {
  void loadSettings()
  void refreshPending()
})
</script>

<template>
  <div class="app has-tabbar">
    <AppTopbar title="設定" large />
    <main class="page" style="gap: var(--sp-5)">
      <!-- 帳號與同步 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">帳號與同步</h2>
        <ul class="list">
          <li>
            <RouterLink class="list-row" to="/settings/account">
              <AppIcon :name="syncState.user ? 'cloud-check' : 'cloud'" :style="{ color: syncState.user ? 'var(--c-ok)' : 'var(--c-ink-2)' }" />
              <div class="list-row__main">
                <div class="list-row__title">{{ syncState.user ? syncState.user.email : '尚未登入' }}</div>
                <div class="list-row__sub">{{ syncState.user ? (syncState.status === 'error' ? '上次同步失敗' : `已同步 · 待上傳 ${syncState.pending} 筆`) : '登入後紀錄會自動同步到雲端' }}</div>
              </div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- 每日學習 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">每日學習</h2>
        <ul class="list">
          <li class="list-row">
            <div class="list-row__main">每日新假名</div>
            <div class="stepper">
              <button type="button" aria-label="減少" @click="step('dailyNewKana', -1, 0, 20)">−</button>
              <span class="num">{{ settings.dailyNewKana }}</span>
              <button type="button" aria-label="增加" @click="step('dailyNewKana', 1, 0, 20)">＋</button>
            </div>
          </li>
          <li class="list-row">
            <div class="list-row__main"><div class="list-row__title">每日目標</div><div class="list-row__sub">達成時提示，仍可繼續</div></div>
            <div class="stepper">
              <button type="button" aria-label="減少" @click="step('dailyGoalMinutes', -5, 5, 120)">−</button>
              <span class="num">{{ settings.dailyGoalMinutes }} 分</span>
              <button type="button" aria-label="增加" @click="step('dailyGoalMinutes', 5, 5, 120)">＋</button>
            </div>
          </li>
          <li class="list-row">
            <div class="list-row__main"><div class="list-row__title">複習過多時暫停新卡</div><div class="list-row__sub">到期複習超過此數時</div></div>
            <div class="stepper">
              <button type="button" aria-label="減少" @click="step('newPauseThreshold', -10, 20, 500)">−</button>
              <span class="num">{{ settings.newPauseThreshold }}</span>
              <button type="button" aria-label="增加" @click="step('newPauseThreshold', 10, 20, 500)">＋</button>
            </div>
          </li>
        </ul>
        <p class="list-note">新卡以「項目」計算，一個假名的「讀」先出現，熟了之後才加入「寫」。</p>
      </section>

      <!-- 顯示 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">顯示</h2>
        <ul class="list">
          <li>
            <label class="list-row">
              <div class="list-row__main"><div class="list-row__title">顯示讀音標注</div><div class="list-row__sub" lang="ja"><ruby>食<rt>た</rt></ruby>べる</div></div>
              <span class="switch"><input type="checkbox" :checked="settings.showFurigana" aria-label="顯示讀音標注" @change="setSetting('showFurigana', ($event.target as HTMLInputElement).checked)" /><span></span></span>
            </label>
          </li>
          <li>
            <RouterLink class="list-row" to="/kana/mark-known">
              <div class="list-row__main"><div class="list-row__title">標記已會的假名</div><div class="list-row__sub">跳過已經熟悉的字</div></div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- 資料 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">資料</h2>
        <ul class="list">
          <li>
            <RouterLink class="list-row" to="/settings/backup">
              <AppIcon name="download" />
              <div class="list-row__main"><div class="list-row__title">備份與還原</div><div class="list-row__sub">匯出／匯入 JSON</div></div>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- 進階 -->
      <section class="stack" style="gap: var(--sp-2)">
        <h2 class="section-title">進階</h2>
        <ul class="list">
          <li>
            <RouterLink class="list-row" to="/settings/calibration">
              <AppIcon name="pencil" />
              <div class="list-row__main"><div class="list-row__title">手寫調校模式</div><div class="list-row__sub">保存筆跡以調整判定門檻</div></div>
              <span class="list-row__value">{{ settings.tuningMode ? '開啟' : '關閉' }}</span>
              <AppIcon name="chev-r" size="sm" class="chev" />
            </RouterLink>
          </li>
          <li>
            <RouterLink class="list-row" to="/settings/about">
              <AppIcon name="info" />
              <div class="list-row__main">關於與資料來源</div>
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

      <p class="caption faint" style="text-align: center; user-select: none" @click="tap">日語練習帳 {{ version }}</p>
    </main>
    <AppTabbar />
  </div>
</template>
