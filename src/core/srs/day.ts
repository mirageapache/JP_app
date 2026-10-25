/**
 * 「每日」的定義（規劃書 §6.2、Q31）：固定以台灣時間（UTC+8）每日 0 點為界，不隨裝置時區變動。
 * 台灣沒有日光節約時間，直接以固定位移計算即可。
 */
export const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 台灣日期鍵，例如 2026-10-25 */
export function dayKey(ms: number): string {
  return new Date(ms + TAIPEI_OFFSET_MS).toISOString().slice(0, 10)
}

/** 該時間所屬台灣日的開始（UTC 毫秒） */
export function startOfDay(ms: number): number {
  return Math.floor((ms + TAIPEI_OFFSET_MS) / DAY_MS) * DAY_MS - TAIPEI_OFFSET_MS
}

export function endOfDay(ms: number): number {
  return startOfDay(ms) + DAY_MS - 1
}

export function addDays(ms: number, days: number): number {
  return ms + days * DAY_MS
}

/** 兩個時間相差的台灣日數（日期鍵之差） */
export function dayDiff(fromMs: number, toMs: number): number {
  return Math.round((startOfDay(toMs) - startOfDay(fromMs)) / DAY_MS)
}
