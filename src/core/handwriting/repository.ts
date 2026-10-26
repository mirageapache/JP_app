import { db, type HandwritingLog, type StrokeSample } from '@/core/db'

/** 手寫紀錄與筆跡樣本的讀取／刪除；頁面不直接碰 Dexie */

export function listHandwritingLogs(): Promise<HandwritingLog[]> {
  return db.handwritingLogs.toArray()
}

export function countPractices(cardId: string): Promise<number> {
  return db.handwritingLogs.where('cardId').equals(cardId).count()
}

/** 每張卡的練習次數（50 音表用）；只掃索引鍵，不載入整筆紀錄 */
export async function practiceCountByCard(): Promise<Map<string, number>> {
  const keys = (await db.handwritingLogs.orderBy('cardId').keys()) as string[]
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  return counts
}

export function listSamples(): Promise<StrokeSample[]> {
  return db.strokeSamples.orderBy('recordedAt').toArray()
}
export async function deleteSample(uuid: string): Promise<void> {
  await db.strokeSamples.delete(uuid)
}
export async function deleteSamplesOf(cardId: string): Promise<void> {
  await db.strokeSamples.where('cardId').equals(cardId).delete()
}
export async function clearSamples(): Promise<void> {
  await db.strokeSamples.clear()
}
