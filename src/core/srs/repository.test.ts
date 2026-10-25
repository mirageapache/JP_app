import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/core/db'
import { addDays } from './day'
import { countNewItemsIntroducedToday, getCard, markKnown, rebuildAllCards, recordReview, todayStats } from './repository'

const T0 = Date.UTC(2026, 9, 25, 2, 0, 0)

describe('SRS repository', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.cardEvents.clear()])
  })

  it('recordReview 寫入紀錄並更新卡片；重建後一致', async () => {
    const { card, log } = await recordReview('kana:あ#read', 3, 1200, T0)
    expect(log.paramsVersion).toBeTruthy()
    expect(log.syncedAt).toBeNull()
    expect(card.reps).toBe(1)
    const stored = await getCard('kana:あ#read', T0)
    expect(stored.due).toBe(card.due)

    await recordReview('kana:あ#read', 4, 800, addDays(T0, 1))
    const before = await db.cards.get('kana:あ#read')
    await db.cards.clear()
    expect(await rebuildAllCards(addDays(T0, 2))).toBe(1)
    const after = await db.cards.get('kana:あ#read')
    expect(after?.due).toBe(before?.due)
    expect(after?.reps).toBe(2)
  })

  it('markKnown 依技能暫停，read 與 write 互不影響', async () => {
    await markKnown(['kana:あ#read', 'kana:い#read'], 'suspend', T0)
    expect((await getCard('kana:あ#read')).suspended).toBe(true)
    expect((await getCard('kana:あ#write')).suspended).toBe(false)
    expect(await db.cardEvents.count()).toBe(2)
    await markKnown(['kana:う#read'], 'occasional', T0)
    const u = await getCard('kana:う#read')
    expect(u.suspended).toBe(false)
    expect(u.state).toBe(2)
  })

  it('今天導入的新項目數與今日統計', async () => {
    await recordReview('kana:あ#read', 3, 1500, T0)
    await recordReview('kana:い#read', 3, 1500, T0 + 1000)
    await recordReview('kana:あ#write', 3, 9000, T0 + 2000) // write 不算新項目
    await recordReview('kana:う#read', 3, 1500, addDays(T0, -1)) // 昨天
    expect(await countNewItemsIntroducedToday(T0 + 5000)).toBe(2)
    const stats = await todayStats(T0 + 5000)
    expect(stats.reviews).toBe(3)
    expect(stats.durationMs).toBe(12000)
  })
})
