import { describe, expect, it } from 'vitest'
import pack from '../../../public/content/kana.json'
import type { KanaPack } from '@/core/content/kana'
import { addDays } from './day'
import { applyRating, emptyCardRecord } from './fsrs'
import { buildDailyQueue, type QueueInput } from './queue'
import type { CardRecord } from './types'

const items = (pack as unknown as KanaPack).items.filter((i) => i.script === 'hiragana' && i.group === 'seion')
const T0 = Date.UTC(2026, 9, 25, 2, 0, 0)

function base(overrides: Partial<QueueInput> = {}): QueueInput {
  return {
    cards: [],
    items,
    now: T0,
    newItemsIntroducedToday: 0,
    dailyNewItems: 5,
    extraNewItems: 0,
    newPauseThreshold: 100,
    commuteMode: false,
    ...overrides,
  }
}

/** 已畢業（Review 狀態）的卡：連評三次良好 */
function graduated(cardId: string, start: number): CardRecord {
  let c = emptyCardRecord(cardId, start)
  for (let i = 0; i < 3; i++) c = applyRating(c, 3, addDays(start, i))
  return c
}

describe('每日佇列', () => {
  it('沒有任何卡時，依學習順序給出 N 個新項目的 read 卡', () => {
    const q = buildDailyQueue(base())
    expect(q.newCount).toBe(5)
    expect(q.entries.map((e) => e.cardId)).toEqual(['kana:あ#read', 'kana:い#read', 'kana:う#read', 'kana:え#read', 'kana:お#read'])
    expect(q.dueCount).toBe(0)
  })

  it('今天已導入的項目會扣掉額度；多學一點會加回', () => {
    expect(buildDailyQueue(base({ newItemsIntroducedToday: 3 })).newCount).toBe(2)
    expect(buildDailyQueue(base({ newItemsIntroducedToday: 5, extraNewItems: 5 })).newCount).toBe(5)
  })

  it('到期複習排在最前面、越久沒複習越先；未到期與暫停的不出', () => {
    const due1 = { ...applyRating(emptyCardRecord('kana:あ#read', T0 - 86400000 * 3), 3, T0 - 86400000 * 3), due: T0 - 1000 }
    const due2 = { ...applyRating(emptyCardRecord('kana:い#read', T0 - 86400000 * 3), 3, T0 - 86400000 * 3), due: T0 - 5000 }
    const future = { ...applyRating(emptyCardRecord('kana:う#read', T0), 3, T0), due: addDays(T0, 3) }
    const suspended = { ...due1, id: 'kana:え#read', itemId: 'kana:え', suspended: true }
    const q = buildDailyQueue(base({ cards: [due1, due2, future, suspended] }))
    expect(q.entries.slice(0, 2).map((e) => e.cardId)).toEqual(['kana:い#read', 'kana:あ#read'])
    expect(q.dueCount).toBe(2)
    // 已開始／暫停的項目不再算新項目
    expect(q.entries.filter((e) => e.kind === 'new').map((e) => e.itemId)).not.toContain('kana:あ')
    expect(q.entries.filter((e) => e.kind === 'new').map((e) => e.itemId)).not.toContain('kana:え')
  })

  it('read 卡畢業後解鎖 write 卡，且不佔新項目額度', () => {
    const read = graduated('kana:あ#read', T0 - 86400000 * 5)
    read.due = addDays(T0, 10) // 今天不到期
    const q = buildDailyQueue(base({ cards: [read], dailyNewItems: 1 }))
    const news = q.entries.filter((e) => e.kind === 'new').map((e) => e.cardId)
    expect(news).toContain('kana:あ#write')
    expect(news).toContain('kana:い#read') // 額度 1 仍給了下一個新項目
    expect(news).toHaveLength(2)
  })

  it('通勤模式延後 write 卡；到期過多時暫停新卡', () => {
    const write = { ...applyRating(emptyCardRecord('kana:あ#write', T0 - 1e6), 3, T0 - 1e6), due: T0 - 1 }
    const q = buildDailyQueue(base({ cards: [write], commuteMode: true }))
    expect(q.deferredWrite).toBe(1)
    expect(q.entries.find((e) => e.skill === 'write')).toBeUndefined()

    const many: CardRecord[] = Array.from({ length: 101 }, (_, i) => ({
      ...applyRating(emptyCardRecord(`kana:x${i}#read`, T0 - 1e6), 3, T0 - 1e6),
      due: T0 - 1,
    }))
    const paused = buildDailyQueue(base({ cards: many }))
    expect(paused.newPaused).toBe(true)
    expect(paused.newCount).toBe(0)
    expect(paused.dueCount).toBe(101)
  })
})
