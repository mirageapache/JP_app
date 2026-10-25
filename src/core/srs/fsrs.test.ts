import { describe, expect, it } from 'vitest'
import { addDays, dayDiff, dayKey, endOfDay, startOfDay } from './day'
import { applyRating, emptyCardRecord, OCCASIONAL_STABILITY_DAYS, PARAMS_VERSION, previewIntervals, rebuildCard } from './fsrs'
import type { CardEventRecord, ReviewLogRecord } from './types'

const T0 = Date.UTC(2026, 9, 25, 2, 0, 0) // 2026-10-25 10:00 台灣時間
const review = (cardId: string, rating: 1 | 2 | 3 | 4, at: number): ReviewLogRecord => ({
  uuid: `${cardId}-${at}`,
  cardId,
  rating,
  reviewedAt: at,
  durationMs: 1000,
  mode: 'session',
  paramsVersion: PARAMS_VERSION,
  deviceId: 'd',
  syncedAt: null,
})
const event = (cardId: string, type: CardEventRecord['type'], at: number, payload?: CardEventRecord['payload']): CardEventRecord => ({
  uuid: `${cardId}-${type}-${at}`,
  cardId,
  type,
  payload,
  at,
  deviceId: 'd',
  syncedAt: null,
})

describe('台灣日界線', () => {
  it('以 UTC+8 的 0 點為界', () => {
    const lateNight = Date.UTC(2026, 9, 25, 15, 30) // 台灣 23:30
    const afterMidnight = Date.UTC(2026, 9, 25, 16, 30) // 台灣隔天 00:30
    expect(dayKey(lateNight)).toBe('2026-10-25')
    expect(dayKey(afterMidnight)).toBe('2026-10-26')
    expect(startOfDay(afterMidnight)).toBe(Date.UTC(2026, 9, 25, 16, 0))
    expect(endOfDay(lateNight)).toBe(Date.UTC(2026, 9, 25, 16, 0) - 1)
    expect(dayDiff(lateNight, afterMidnight)).toBe(1)
    expect(dayKey(addDays(lateNight, 1))).toBe('2026-10-26')
  })
})

describe('FSRS 封裝', () => {
  it('評分後進入學習狀態、重放結果一致（無 fuzz）', () => {
    const card = emptyCardRecord('kana:あ#read', T0)
    expect(card.itemId).toBe('kana:あ')
    expect(card.skill).toBe('read')
    const a = applyRating(card, 3, T0)
    const b = applyRating(card, 3, T0)
    expect(a).toEqual(b)
    expect(a.reps).toBe(1)
    expect(a.due).toBeGreaterThan(T0)
    expect(applyRating(card, 4, T0).due).toBeGreaterThan(applyRating(card, 1, T0).due)
  })

  it('previewIntervals 回傳四個評分的間隔文字', () => {
    const p = previewIntervals(emptyCardRecord('kana:あ#read', T0), T0)
    expect(p[1]).toMatch(/分|小時|天/)
    expect(p[4]).toMatch(/天/)
  })

  it('rebuildCard 依時間重放評分，與逐步套用相同', () => {
    const id = 'kana:あ#read'
    const r1 = review(id, 3, T0)
    const r2 = review(id, 3, addDays(T0, 1))
    const r3 = review(id, 1, addDays(T0, 5))
    let step = emptyCardRecord(id, T0)
    for (const r of [r1, r2, r3]) step = applyRating(step, r.rating, r.reviewedAt)
    const rebuilt = rebuildCard(id, [r3, r1, r2], [], addDays(T0, 6))
    expect(rebuilt.due).toBe(step.due)
    expect(rebuilt.stability).toBeCloseTo(step.stability)
    expect(rebuilt.lapses).toBe(1)
  })

  it('markKnown：suspend 暫停、occasional 以長穩定度排入；unsuspend 與 reset', () => {
    const id = 'kana:い#read'
    const suspended = rebuildCard(id, [], [event(id, 'markKnown', T0, { mode: 'suspend' })], T0)
    expect(suspended.suspended).toBe(true)
    expect(suspended.reps).toBe(0)

    const occasional = rebuildCard(id, [], [event(id, 'markKnown', T0, { mode: 'occasional' })], T0)
    expect(occasional.suspended).toBe(false)
    expect(occasional.state).toBe(2)
    expect(dayDiff(T0, occasional.due)).toBe(OCCASIONAL_STABILITY_DAYS)

    const resumed = rebuildCard(id, [], [event(id, 'markKnown', T0, { mode: 'suspend' }), event(id, 'unsuspend', T0 + 1)], T0)
    expect(resumed.suspended).toBe(false)

    const reset = rebuildCard(id, [review(id, 3, T0)], [event(id, 'reset', T0 + 1000)], T0 + 2000)
    expect(reset.reps).toBe(0)
    expect(reset.state).toBe(0)
  })

  it('全域 paramsChanged 事件不會中斷重放', () => {
    const id = 'kana:う#read'
    const card = rebuildCard(id, [review(id, 3, T0)], [event('*', 'paramsChanged', T0 - 1, { paramsVersion: 'unknown-version' })], T0 + 1)
    expect(card.reps).toBe(1)
  })
})
