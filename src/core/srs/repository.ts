import { db } from '@/core/db'
import { getDeviceId } from '@/core/sync/deviceId'
import { dayKey } from './day'
import { applyRating, emptyCardRecord, PARAMS_VERSION, rebuildCard } from './fsrs'
import type { CardEventRecord, CardEventType, CardRecord, MarkKnownPayload, Rating, ReviewLogRecord } from './types'

/**
 * SRS 資料存取：寫入紀錄（只增）並同步更新 cards 快取。
 * 任何時候都可用 rebuildCards() 由紀錄重建快取（同步下載後、資料修復）。
 */

export async function getCard(cardId: string, now = Date.now()): Promise<CardRecord> {
  return (await db.cards.get(cardId)) ?? emptyCardRecord(cardId, now)
}

/** 所有卡片快取（每日佇列、標記已會頁） */
export function listCards(): Promise<CardRecord[]> {
  return db.cards.toArray()
}

/** 記錄一次評分：寫入 reviewLogs，並以 FSRS 更新該卡 */
export async function recordReview(
  cardId: string,
  rating: Rating,
  durationMs: number,
  now = Date.now(),
): Promise<{ card: CardRecord; log: ReviewLogRecord }> {
  const log: ReviewLogRecord = {
    uuid: crypto.randomUUID(),
    cardId,
    rating,
    reviewedAt: now,
    durationMs: Math.round(durationMs),
    mode: 'session',
    paramsVersion: PARAMS_VERSION,
    deviceId: getDeviceId(),
    syncedAt: null,
  }
  const card = await db.transaction('rw', db.reviewLogs, db.cards, async () => {
    const current = await getCard(cardId, now)
    const next = applyRating(current, rating, now)
    await db.reviewLogs.add(log)
    await db.cards.put(next)
    return next
  })
  return { card, log }
}

/** 寫入卡片事件並重建該卡 */
export async function addCardEvent(
  cardId: string,
  type: CardEventType,
  payload?: CardEventRecord['payload'],
  now = Date.now(),
): Promise<CardRecord> {
  const event: CardEventRecord = { uuid: crypto.randomUUID(), cardId, type, payload, at: now, deviceId: getDeviceId(), syncedAt: null }
  return db.transaction('rw', db.cardEvents, db.reviewLogs, db.cards, async () => {
    await db.cardEvents.add(event)
    const card = await rebuildOne(cardId, now)
    await db.cards.put(card)
    return card
  })
}

/** 標記已會（規劃書 §6.2）：以卡片（含技能）為單位 */
export async function markKnown(cardIds: string[], mode: MarkKnownPayload['mode'], now = Date.now()): Promise<void> {
  const deviceId = getDeviceId()
  const events: CardEventRecord[] = cardIds.map((cardId) => ({
    uuid: crypto.randomUUID(),
    cardId,
    type: 'markKnown',
    payload: { mode },
    at: now,
    deviceId,
    syncedAt: null,
  }))
  await db.transaction('rw', db.cardEvents, db.reviewLogs, db.cards, async () => {
    await db.cardEvents.bulkAdd(events)
    const cards = await Promise.all(cardIds.map((id) => rebuildOne(id, now)))
    await db.cards.bulkPut(cards)
  })
}

async function rebuildOne(cardId: string, now: number): Promise<CardRecord> {
  const [reviews, events] = await Promise.all([
    db.reviewLogs.where('cardId').equals(cardId).toArray(),
    db.cardEvents.where('cardId').anyOf([cardId, '*']).toArray(),
  ])
  return rebuildCard(cardId, reviews, events, now)
}

/** 重建指定卡片（同步下載後只重建受影響的卡） */
export async function rebuildCards(cardIds: Iterable<string>, now = Date.now()): Promise<number> {
  const ids = [...new Set(cardIds)].filter((id) => id !== '*')
  await db.transaction('rw', db.cardEvents, db.reviewLogs, db.cards, async () => {
    const cards = await Promise.all(ids.map((id) => rebuildOne(id, now)))
    await db.cards.bulkPut(cards)
  })
  return ids.length
}

/** 全量重建（新裝置還原、資料修復） */
export async function rebuildAllCards(now = Date.now()): Promise<number> {
  // clear 與重建放同一交易：中途失敗時不會留下一個空的 cards 表（所有卡被當成新卡）
  return db.transaction('rw', db.cardEvents, db.reviewLogs, db.cards, async () => {
    const [reviewIds, eventIds] = await Promise.all([
      db.reviewLogs.orderBy('cardId').uniqueKeys(),
      db.cardEvents.orderBy('cardId').uniqueKeys(),
    ])
    const ids = new Set<string>([...(reviewIds as string[]), ...(eventIds as string[])])
    await db.cards.clear()
    return rebuildCards(ids, now)
  })
}

/** 今天（台灣日）導入的新項目數：今天第一次評分的 read 卡 */
export async function countNewItemsIntroducedToday(now = Date.now()): Promise<number> {
  const today = dayKey(now)
  const cards = await db.cards.filter((c) => c.skill === 'read' && c.reps > 0).toArray()
  let count = 0
  for (const c of cards) {
    const firstAt = (await db.reviewLogs.where('cardId').equals(c.id).sortBy('reviewedAt'))[0]?.reviewedAt
    if (firstAt !== undefined && dayKey(firstAt) === today) count++
  }
  return count
}

/** 今天的學習時間（毫秒）與題數 */
export async function todayStats(now = Date.now()): Promise<{ durationMs: number; reviews: number }> {
  const today = dayKey(now)
  const logs = await db.reviewLogs.where('reviewedAt').above(now - 36 * 3600 * 1000).toArray()
  let durationMs = 0
  let reviews = 0
  for (const l of logs) {
    if (dayKey(l.reviewedAt) !== today) continue
    durationMs += l.durationMs
    reviews++
  }
  return { durationMs, reviews }
}
