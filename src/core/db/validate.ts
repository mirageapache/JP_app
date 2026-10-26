import type { CardEventRecord, ReviewLogRecord } from '@/core/srs/types'
import type { HandwritingLog } from './index'

/**
 * 外部資料（備份檔、雲端 chunk）進入 Dexie 前的型別守衛。
 * 壞掉的一列若直接寫入，FSRS 會算出 NaN 的 due、索引靜默略過，卡片從此消失；寧可略過並記錄。
 */

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isNullableNum = (x: unknown): x is number | null => x === null || isNum(x)

export function isReviewLog(x: unknown): x is ReviewLogRecord {
  return (
    isObj(x) &&
    isStr(x.uuid) &&
    isStr(x.cardId) &&
    (x.rating === 1 || x.rating === 2 || x.rating === 3 || x.rating === 4) &&
    isNum(x.reviewedAt) &&
    isNum(x.durationMs) &&
    x.mode === 'session' &&
    isStr(x.paramsVersion) &&
    isStr(x.deviceId) &&
    isNullableNum(x.syncedAt)
  )
}

const EVENT_TYPES = new Set(['markKnown', 'suspend', 'unsuspend', 'reset', 'paramsChanged'])

export function isCardEvent(x: unknown): x is CardEventRecord {
  return (
    isObj(x) &&
    isStr(x.uuid) &&
    isStr(x.cardId) &&
    typeof x.type === 'string' &&
    EVENT_TYPES.has(x.type) &&
    (x.payload === undefined || isObj(x.payload)) &&
    isNum(x.at) &&
    isStr(x.deviceId) &&
    isNullableNum(x.syncedAt)
  )
}

export function isHandwritingLog(x: unknown): x is HandwritingLog {
  return (
    isObj(x) &&
    isStr(x.uuid) &&
    isStr(x.cardId) &&
    isStr(x.variantId) &&
    isNum(x.score) &&
    Array.isArray(x.strokeResults) &&
    isNum(x.misses) &&
    isNum(x.hintsUsed) &&
    typeof x.skipped === 'boolean' &&
    isNum(x.durationMs) &&
    isNum(x.at) &&
    isNullableNum(x.syncedAt)
  )
}

/** 過濾掉格式不對的列；呼叫端用 skipped 決定要不要警告 */
export function filterValid<T>(rows: unknown, guard: (x: unknown) => x is T): { rows: T[]; skipped: number } {
  if (!Array.isArray(rows)) return { rows: [], skipped: 0 }
  const ok: T[] = []
  for (const r of rows) if (guard(r)) ok.push(r)
  return { rows: ok, skipped: rows.length - ok.length }
}
