import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { router } from '@/app/router'
import DebugPage from '@/modules/settings/DebugPage.vue'
import { db } from '@/core/db'

describe('DebugPage', () => {
  it('掛載後顯示裝置資訊與紀錄', async () => {
    await db.errorLogs.clear()
    await db.errorLogs.add({ level: 'warn', message: 'hello', at: Date.now() })
    await router.push('/settings/debug')
    await router.isReady()
    const w = mount(DebugPage, { global: { plugins: [createPinia(), router] } })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()
    expect(w.text()).toContain('主畫面模式')
    expect(w.text()).toContain('hello')
  })
})
