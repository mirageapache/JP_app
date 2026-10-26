<script setup lang="ts">
import { computed, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTabbar from '@/components/AppTabbar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { settings } from '@/core/settings'
import { useDailySession } from '@/core/srs/useDailySession'
import { daysSinceSync, REMIND_AFTER_DAYS, syncState } from '@/core/sync/useSync'

/** 今日（規劃書 §6.2；docs/ui-mockups/home.html） */
const session = useDailySession()

const dateText = computed(() => {
  const d = new Date()
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日（${w}）`
})
const minutesDone = computed(() => Math.round(session.today.value.durationMs / 60000))
const goal = computed(() => settings.dailyGoalMinutes)
const ringPercent = computed(() => Math.min(100, Math.round((100 * minutesDone.value) / Math.max(1, goal.value))))
const queue = computed(() => session.queue.value)
/** 預估時間：辨識 7 秒、手寫 15 秒 */
const estimateMin = computed(() => {
  const q = queue.value
  if (!q) return 0
  const write = q.entries.filter((e) => e.skill === 'write').length
  return Math.max(1, Math.round(((q.entries.length - write) * 7 + write * 15) / 60))
})
const goalReached = computed(() => minutesDone.value >= goal.value)
/** 已登入但超過 3 天沒同步成功時提醒（規劃書 §7.5） */
const syncReminder = computed(() => {
  if (!syncState.user) return ''
  const d = daysSinceSync()
  if (d === null) return '尚未同步過，請確認網路連線'
  return d >= REMIND_AFTER_DAYS ? `已 ${d} 天沒有同步，請確認網路連線` : ''
})

onMounted(() => session.refresh())
</script>

<template>
  <div class="app has-tabbar">
    <AppTopbar title="今日" large>
      <template #actions>
        <RouterLink class="icon-btn" to="/settings" aria-label="設定"><AppIcon name="sliders" /></RouterLink>
      </template>
    </AppTopbar>

    <main class="page">
      <p class="muted small" style="margin-top: -12px">{{ dateText }}</p>
      <p v-if="session.error.value" class="banner banner--shu">{{ session.error.value }}</p>
      <RouterLink v-if="syncReminder" class="banner banner--warn" to="/settings/account"><AppIcon name="cloud" size="sm" /><span>{{ syncReminder }}</span></RouterLink>

      <section class="card stack" style="gap: var(--sp-4)">
        <div class="row" style="gap: var(--sp-5)">
          <div class="ring" :class="{ 'ring--ok': goalReached }" :style="{ '--p': ringPercent, '--size': '104px' }">
            <div>
              <div class="num" style="font-size: 1.75rem; font-weight: 700; line-height: 1">{{ minutesDone }}</div>
              <div class="caption faint">/ {{ goal }} 分鐘</div>
            </div>
          </div>
          <div class="grow stack" style="gap: var(--sp-2)">
            <div class="row row--between"><span class="muted">待複習</span><strong class="num">{{ queue?.dueCount ?? '—' }}</strong></div>
            <div class="row row--between"><span class="muted">新卡</span><strong class="num">{{ queue?.newCount ?? '—' }}</strong></div>
            <div class="row row--between"><span class="muted">預估時間</span><strong class="num">約 {{ estimateMin }} 分</strong></div>
          </div>
        </div>
        <p v-if="queue?.newPaused" class="small muted"><AppIcon name="info" size="sm" /> 到期複習較多，今天先暫停新卡（含「多學一點」）。</p>
        <p v-if="queue?.capped" class="small muted">已達每日題數上限，{{ queue.capped }} 張留到明天。</p>
        <p v-if="queue?.deferredWrite" class="small muted">通勤模式：{{ queue.deferredWrite }} 張手寫卡延後到今天稍晚。</p>
        <RouterLink class="btn btn--primary btn--lg btn--block" :class="{ 'btn--secondary': queue && queue.entries.length === 0 }" to="/session">
          {{ goalReached ? '繼續學習' : queue && queue.entries.length === 0 ? '今天沒有待學的卡片' : '開始學習' }}
        </RouterLink>
        <p v-if="goalReached" class="small faint" style="text-align: center">今天的目標完成了，想繼續也可以。</p>
      </section>

      <section class="list">
        <label class="list-row">
          <AppIcon name="train" style="color: var(--c-primary)" />
          <div class="list-row__main">
            <div class="list-row__title">今天先不手寫</div>
            <div class="list-row__sub">手寫題延後到今天稍晚，只出點選題</div>
          </div>
          <span class="switch"><input type="checkbox" :checked="session.commuteMode.value" aria-label="今天先不手寫" @change="session.setCommuteMode(($event.target as HTMLInputElement).checked).then(() => session.refresh())" /><span></span></span>
        </label>
      </section>

      <section class="stack">
        <h2 class="section-title">自由練習<span class="caption faint">不影響複習排程</span></h2>
        <div class="chips">
          <RouterLink class="chip" to="/kana"><span class="glyph" lang="ja" style="font-family: var(--font-ja-display)">あ</span>50 音表</RouterLink>
          <RouterLink class="chip" to="/kana/mark-known"><AppIcon name="check" size="sm" />標記已會</RouterLink>
        </div>
      </section>

      <button class="btn btn--secondary btn--block" type="button" :disabled="queue?.newPaused" @click="session.addExtraNew(settings.dailyNewKana).then(() => session.refresh())">
        <AppIcon name="plus" size="sm" />今天想多學一點（+{{ settings.dailyNewKana }}）
      </button>
    </main>

    <AppTabbar />
  </div>
</template>

<style scoped>
.ring--ok {
  background: conic-gradient(var(--c-ok) calc(var(--p) * 1%), var(--c-surface-2) 0);
}
</style>
