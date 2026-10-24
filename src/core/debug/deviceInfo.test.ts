import { describe, expect, it } from 'vitest'
import { getDeviceInfo } from './deviceInfo'

describe('getDeviceInfo', () => {
  it('在沒有 Service Worker 與 storage API 的環境也能回傳資料', async () => {
    const info = await getDeviceInfo()
    expect(info.userAgent).toBeTruthy()
    expect(info.viewport).toMatch(/^\d+×\d+$/)
    expect(['controlled', 'registered', 'none', 'unsupported', 'unknown']).toContain(info.serviceWorker)
  })
})
