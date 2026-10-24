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
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/modules/home/NotFoundPage.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
