import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/modules/home/HomePage.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/modules/settings/SettingsPage.vue') },
    { path: '/settings/debug', name: 'debug', component: () => import('@/modules/settings/DebugPage.vue') },
    { path: '/p0', name: 'p0', component: () => import('@/modules/p0/P0IndexPage.vue') },
    { path: '/p0/handwriting', name: 'p0-handwriting', component: () => import('@/modules/p0/P0HandwritingPage.vue') },
    { path: '/p0/firebase', name: 'p0-firebase', component: () => import('@/modules/p0/P0FirebasePage.vue') },
    { path: '/p0/device', name: 'p0-device', component: () => import('@/modules/p0/P0DevicePage.vue') },
    { path: '/p0/ui-vant', name: 'p0-ui-vant', component: () => import('@/modules/p0/trials/P0UiVantPage.vue') },
    { path: '/p0/ui-konsta', name: 'p0-ui-konsta', component: () => import('@/modules/p0/trials/P0UiKonstaPage.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/modules/home/NotFoundPage.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
