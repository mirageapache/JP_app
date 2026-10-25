import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/app/router'
import { resetSettingsCache, setSetting } from '@/core/settings'

describe('App', () => {
  it('首次開啟會導向引導頁；完成後首頁顯示今日學習入口', async () => {
    resetSettingsCache()
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('onboarding')
    await setSetting('onboardingDone', true)
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await new Promise((r) => setTimeout(r, 50))
    expect(wrapper.text()).toContain('今日')
    expect(wrapper.text()).toContain('今天先不手寫')
  })
})
