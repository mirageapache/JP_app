import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { router } from '@/app/router'

describe('App', () => {
  it('首頁可以掛載並顯示 P0 入口', async () => {
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.isReady()
    expect(wrapper.text()).toContain('P0 驗證清單')
  })
})
