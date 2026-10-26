import { createRouter, createWebHistory } from 'vue-router'
import { loadSettings, settings } from '@/core/settings'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/modules/home/HomePage.vue') },
    { path: '/session', name: 'session', component: () => import('@/modules/session/SessionPage.vue') },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/modules/home/OnboardingPage.vue') },
    { path: '/kana', name: 'kana', component: () => import('@/modules/kana/KanaChartPage.vue') },
    { path: '/kana/mark-known', name: 'mark-known', component: () => import('@/modules/kana/MarkKnownPage.vue') },
    { path: '/kana/confusables', name: 'confusables', component: () => import('@/modules/kana/ConfusablesPage.vue') },
    { path: '/kana/weak', name: 'weak', component: () => import('@/modules/kana/WeakPage.vue') },
    { path: '/kana/:char', name: 'kana-detail', component: () => import('@/modules/kana/KanaDetailPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/modules/settings/SettingsPage.vue') },
    { path: '/settings/calibration', name: 'calibration', component: () => import('@/modules/settings/CalibrationPage.vue') },
    { path: '/settings/account', name: 'account', component: () => import('@/modules/settings/AccountPage.vue') },
    { path: '/settings/backup', name: 'backup', component: () => import('@/modules/settings/BackupPage.vue') },
    { path: '/settings/about', name: 'about', component: () => import('@/modules/settings/AboutPage.vue') },
    { path: '/settings/debug', name: 'debug', component: () => import('@/modules/settings/DebugPage.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/modules/home/NotFoundPage.vue') },
  ],
  // 返回時回到原本的捲動位置（50 音表下半部進詳細頁再返回不會跳回頂端）
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

/** 首次開啟先到引導頁（規劃書 Q23） */
router.beforeEach(async (to) => {
  if (to.name === 'onboarding') return true
  await loadSettings()
  if (!settings.onboardingDone) return { name: 'onboarding' }
  return true
})

/** 路由載入失敗（例如離線且 chunk 未快取）只記錄，不讓畫面停在空白 */
router.onError((e) => {
  console.error('路由錯誤', e)
})
