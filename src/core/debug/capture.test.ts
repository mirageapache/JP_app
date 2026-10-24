import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/core/db'
import { installErrorCapture, record, uninstallErrorCapture } from './capture'

async function flush() {
  // record() 是非同步寫入，等待微任務與 Dexie 完成
  await new Promise((r) => setTimeout(r, 20))
}

describe('錯誤收集', () => {
  beforeEach(async () => {
    await db.errorLogs.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    uninstallErrorCapture()
    vi.restoreAllMocks()
  })

  it('console.warn 會寫進 errorLogs', async () => {
    installErrorCapture()
    console.warn('hello', { a: 1 })
    await flush()
    const rows = await db.errorLogs.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ level: 'warn', message: 'hello {"a":1}' })
  })

  it('window error 事件會記錄訊息與堆疊', async () => {
    installErrorCapture()
    const err = new Error('boom')
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: err, filename: 'a.js', lineno: 1, colno: 2 }))
    await flush()
    // happy-dom 自己也會把 error 事件印到 console.error，所以只找事件處理器寫入的那一筆
    const rows = (await db.errorLogs.where('level').equals('error').toArray()).filter((r) =>
      r.message.includes('(a.js:1:2)'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.message).toContain('boom')
    expect(rows[0]?.stack).toBe(err.stack)
  })

  it('超過上限時刪除最舊的紀錄', async () => {
    for (let i = 0; i < 560; i++) await record('log', `m${i}`)
    // 每 50 筆修剪一次，所以上限是 500 + 50
    const count = await db.errorLogs.count()
    expect(count).toBeLessThanOrEqual(550)
    const oldest = await db.errorLogs.orderBy('at').first()
    expect(oldest?.message).not.toBe('m0')
  })
})
