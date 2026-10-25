import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/app/router'

describe('App', () => {
  it('首頁可以掛載並顯示今日學習入口', async () => {
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    await new Promise((r) => setTimeout(r, 50))
    expect(wrapper.text()).toContain('今日')
    expect(wrapper.text()).toContain('今天先不手寫')
  })
})
