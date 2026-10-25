import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/core/db'
import { loadSettings, resetSettingsCache, SETTING_DEFAULTS, setSetting, settings } from './index'

describe('settings', () => {
  beforeEach(async () => {
    await db.settings.clear()
    resetSettingsCache()
  })

  it('沒有資料時使用預設值，且不寫入 Dexie', async () => {
    await loadSettings()
    expect(settings.showFurigana).toBe(SETTING_DEFAULTS.showFurigana)
    expect(await db.settings.count()).toBe(0)
  })

  it('setSetting 先寫 Dexie 再更新快取，並記錄 scope 與 updatedAt', async () => {
    await loadSettings()
    await setSetting('tuningMode', true)
    expect(settings.tuningMode).toBe(true)
    const row = await db.settings.get('tuningMode')
    expect(row?.value).toBe(true)
    expect(row?.scope).toBe('device')
    expect(row?.updatedAt).toBeTypeOf('number')
  })

  it('重新載入時讀回已儲存的值', async () => {
    await setSetting('kanaStrokeVariants', { そ: 'two' })
    resetSettingsCache()
    await loadSettings()
    expect(settings.kanaStrokeVariants).toEqual({ そ: 'two' })
  })
})
