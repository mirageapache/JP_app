import { describe, expect, it } from 'vitest'
import pack from '../../../public/content/kana.json'
import { KANA_LADDER, toSchedulable, type KanaPack } from '@/core/content/kana'
import { addDays } from './day'
import { applyRating, emptyCardRecord } from './fsrs'
import { buildDailyQueue, type QueueInput } from './queue'
import type { CardRecord } from './types'

const items = (pack as unknown as KanaPack).items.filter((i) => i.script === 'hiragana' && i.group === 'seion')
const T0 = Date.UTC(2026, 9, 25, 2, 0, 0)

function base(overrides: Partial<QueueInput> = {}): QueueInput {
  return {
    cards: [],
    items: items.map(toSchedulable),
    ladders: { kana: KANA_LADDER },
    now: T0,
    newItemsIntroducedToday: 0,
    dailyNewItems: 5,
    extraNewItems: 0,
    newPauseThreshold: 100,
    maxCards: 0,
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
  it('設定值是 NaN 時不會把全部假名排成新卡', () => {
    const q = buildDailyQueue(base({ dailyNewItems: NaN, extraNewItems: NaN, newPauseThreshold: NaN }))
    expect(q.newCount).toBe(0)
    expect(q.newPaused).toBe(false)
  })

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
    // 已開始／暫停的項目不再算新項目（え 的 read 已標記已會，只會解鎖 write）
    const newReads = q.entries.filter((e) => e.kind === 'new' && e.skill === 'read').map((e) => e.itemId)
    expect(newReads).not.toContain('kana:あ')
    expect(newReads).not.toContain('kana:え')
    expect(q.entries.map((e) => e.cardId)).toContain('kana:え#write')
  })

  it('read 卡畢業後解鎖 write 卡，且不佔新項目額度', () => {
    const read = graduated('kana:あ#read', T0 - 86400000 * 5)
    read.due = addDays(T0, 10) // 今天不到期（最後複習在 3 天前）
    const q = buildDailyQueue(base({ cards: [read], dailyNewItems: 1 }))
    const news = q.entries.filter((e) => e.kind === 'new').map((e) => e.cardId)
    expect(news).toContain('kana:あ#write')
    expect(news).toContain('kana:い#read') // 額度 1 仍給了下一個新項目
    expect(news).toHaveLength(2)
  })

  it('read 卡昨天練過一次（尚未畢業）就解鎖 write（規劃書：首次複習通過）', () => {
    const yesterday = T0 - 86400000
    const read = { ...applyRating(emptyCardRecord('kana:あ#read', yesterday), 3, yesterday), due: addDays(T0, 10) }
    expect(read.state).not.toBe(2)
    expect(buildDailyQueue(base({ cards: [read] })).entries.map((e) => e.cardId)).toContain('kana:あ#write')
  })

  it('每日總量上限：複習優先，超過的留到明天', () => {
    const many: CardRecord[] = Array.from({ length: 8 }, (_, i) => ({
      ...applyRating(emptyCardRecord(`kana:x${i}#read`, T0 - 1e6), 3, T0 - 1e6),
      due: T0 - 1,
    }))
    const q = buildDailyQueue(base({ cards: many, maxCards: 10 }))
    expect(q.entries).toHaveLength(10)
    expect(q.dueCount).toBe(8)
    expect(q.newCount).toBe(2)
    expect(q.capped).toBe(3) // 8 複習 + 5 新卡 = 13，留 3 張
    expect(buildDailyQueue(base({ cards: many, maxCards: 0 })).capped).toBe(0)
  })

  it('read 今天才畢業不解鎖 write（技能不同天出現）；read 標記已會則解鎖 write', () => {
    const todayGrad = { ...graduated('kana:あ#read', T0 - 86400000 * 2), lastReview: T0 - 1000, due: addDays(T0, 10) }
    expect(buildDailyQueue(base({ cards: [todayGrad] })).entries.map((e) => e.cardId)).not.toContain('kana:あ#write')
    const known = { ...emptyCardRecord('kana:い#read', T0), suspended: true }
    expect(buildDailyQueue(base({ cards: [known] })).entries.map((e) => e.cardId)).toContain('kana:い#write')
  })

  it('通勤模式延後 write 卡；到期過多時暫停新卡', () => {
    const write = { ...applyRating(emptyCardRecord('kana:あ#write', T0 - 1e6), 3, T0 - 1e6), due: T0 - 1 }
    const q = buildDailyQueue(base({ cards: [write], commuteMode: true }))
    expect(q.deferred).toBe(1)
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
