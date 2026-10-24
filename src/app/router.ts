import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/modules/home/HomePage.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/modules/settings/SettingsPage.vue') },
    { path: '/p0', name: 'p0', component: () => import('@/modules/p0/P0IndexPage.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/modules/home/NotFoundPage.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
