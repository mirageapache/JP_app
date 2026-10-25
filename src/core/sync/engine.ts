import { db, type HandwritingLog } from '@/core/db'
import { resetSettingsCache, SETTING_SCOPE } from '@/core/settings'
import { rebuildCards } from '@/core/srs/repository'
import type { CardEventRecord, ReviewLogRecord } from '@/core/srs/types'
import { getDeviceId } from './deviceId'
import { SCHEMA_VERSION, type ChunkDoc, type ChunkPayload, type RemoteSettings, type SyncTransport } from './transport'

/**
 * 同步引擎（規劃書 §7.5）：
 * - 上傳：把 syncedAt 為 null 的紀錄打包成 chunk；成功後才標記 syncedAt
 * - 下載：lastPulledAt = 上次下載到的 chunk 中最大的 createdAt（伺服器時間）；用 >= 重疊查詢、uuid 去重；
 *   自己裝置的 chunk 直接忽略；只重建受影響的卡片
 * - 設定：先下載再上傳；只上傳使用者實際修改過的 key（updatedAt 不為 null）；以 updatedAt 較新者為準
 */

/** 單一 chunk 的紀錄數上限（Firestore 文件 1 MiB；手寫紀錄較大，保守估計） */
export const CHUNK_MAX_RECORDS = 400

export interface SyncMeta {
  key: 'main'
  uid: string | null
  lastPulledAt: number | null
  lastPushedAt: number | null
  lastSettingsPushAt: number | null
  lastError: string | null
}

export interface SyncResult {
  pushed: number
  pulled: number
  rebuiltCards: number
  settingsPulled: number
  settingsPushed: number
}

const EMPTY_META: SyncMeta = { key: 'main', uid: null, lastPulledAt: null, lastPushedAt: null, lastSettingsPushAt: null, lastError: null }

export async function getSyncMeta(): Promise<SyncMeta> {
  return (await db.syncMeta.get('main')) ?? { ...EMPTY_META }
}

async function patchMeta(patch: Partial<SyncMeta>): Promise<void> {
  const cur = await getSyncMeta()
  await db.syncMeta.put({ ...cur, ...patch })
}

export async function countPending(): Promise<number> {
  const [a, b, c] = await Promise.all([
    db.reviewLogs.filter((r) => r.syncedAt === null).count(),
    db.cardEvents.filter((r) => r.syncedAt === null).count(),
    db.handwritingLogs.filter((r) => r.syncedAt === null).count(),
  ])
  return a + b + c
}

export function createSyncEngine(transport: SyncTransport) {
  async function ensureUid(uid: string) {
    const meta = await getSyncMeta()
    // 換了帳號：之前的下載基準不適用，從頭下載
    if (meta.uid !== uid) await db.syncMeta.put({ ...EMPTY_META, uid })
  }

  /** 上傳所有尚未同步的紀錄 */
  async function push(uid: string, now = Date.now()): Promise<number> {
    const [reviews, events, hand] = await Promise.all([
      db.reviewLogs.filter((r) => r.syncedAt === null).toArray(),
      db.cardEvents.filter((r) => r.syncedAt === null).toArray(),
      db.handwritingLogs.filter((r) => r.syncedAt === null).toArray(),
    ])
    let total = 0
    const deviceId = getDeviceId()
    // 依上限切成多個 chunk
    let queue: { reviews: ReviewLogRecord[]; events: CardEventRecord[]; hand: HandwritingLog[] } = { reviews, events, hand }
    while (queue.reviews.length + queue.events.length + queue.hand.length > 0) {
      const batch = takeBatch(queue, CHUNK_MAX_RECORDS)
      queue = batch.rest
      const payload: ChunkPayload = {
        deviceId,
        schemaVersion: SCHEMA_VERSION,
        reviewLogs: strip(batch.reviews),
        cardEvents: strip(batch.events),
        handwritingLogs: strip(batch.hand),
      }
      await transport.uploadChunk(uid, payload)
      await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs], async () => {
        await Promise.all([
          ...batch.reviews.map((r) => db.reviewLogs.update(r.uuid, { syncedAt: now })),
          ...batch.events.map((r) => db.cardEvents.update(r.uuid, { syncedAt: now })),
          ...batch.hand.map((r) => db.handwritingLogs.update(r.uuid, { syncedAt: now })),
        ])
      })
      total += batch.reviews.length + batch.events.length + batch.hand.length
    }
    if (total) await patchMeta({ lastPushedAt: now })
    return total
  }

  /** 下載其他裝置的新 chunk，合併並重建受影響的卡片 */
  async function pull(uid: string): Promise<{ pulled: number; rebuiltCards: number }> {
    const meta = await getSyncMeta()
    const chunks = await transport.listChunks(uid, meta.lastPulledAt ?? undefined)
    const deviceId = getDeviceId()
    let pulled = 0
    const affected = new Set<string>()
    let maxCreated = meta.lastPulledAt ?? 0
    for (const c of chunks) {
      maxCreated = Math.max(maxCreated, c.createdAt)
      if (c.deviceId === deviceId) continue
      const added = await mergeChunk(c)
      pulled += added.count
      for (const id of added.cardIds) affected.add(id)
    }
    const rebuiltCards = affected.size ? await rebuildCards(affected) : 0
    if (chunks.length) await patchMeta({ lastPulledAt: maxCreated })
    return { pulled, rebuiltCards }
  }

  /** 設定：先下載（較新者為準），再上傳本機修改過且更新時間晚於上次上傳的 key */
  async function syncSettings(uid: string, now = Date.now()): Promise<{ pulled: number; pushed: number }> {
    const remote = await transport.getSettings(uid)
    const local = await db.settings.toArray()
    const localByKey = new Map(local.map((s) => [s.key, s]))
    let pulled = 0
    for (const [key, r] of Object.entries(remote)) {
      if (SETTING_SCOPE[key as keyof typeof SETTING_SCOPE] !== 'account') continue
      const l = localByKey.get(key)
      if (!l || l.updatedAt === null || r.updatedAt > l.updatedAt) {
        await db.settings.put({ key, value: r.value, scope: 'account', updatedAt: r.updatedAt })
        pulled++
      }
    }
    if (pulled) resetSettingsCache()

    const meta = await getSyncMeta()
    const patch: RemoteSettings = {}
    for (const s of local) {
      if (s.scope !== 'account' || s.updatedAt === null) continue
      const r = remote[s.key]
      if (r && r.updatedAt >= s.updatedAt) continue
      if (meta.lastSettingsPushAt !== null && s.updatedAt <= meta.lastSettingsPushAt && r) continue
      patch[s.key] = { value: s.value, updatedAt: s.updatedAt }
    }
    await transport.setSettings(uid, patch)
    await patchMeta({ lastSettingsPushAt: now })
    return { pulled, pushed: Object.keys(patch).length }
  }

  /** 完整一輪：設定下載 → 下載紀錄 → 上傳紀錄 → 設定上傳 */
  async function sync(uid: string): Promise<SyncResult> {
    await ensureUid(uid)
    try {
      const s = await syncSettings(uid)
      const p = await pull(uid)
      const pushed = await push(uid)
      await patchMeta({ lastError: null })
      return { pushed, pulled: p.pulled, rebuiltCards: p.rebuiltCards, settingsPulled: s.pulled, settingsPushed: s.pushed }
    } catch (e) {
      await patchMeta({ lastError: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }

  /** 刪除雲端資料並清除同步基準（本機資料保留） */
  async function deleteCloud(uid: string): Promise<number> {
    const n = await transport.deleteAll(uid)
    await db.syncMeta.put({ ...EMPTY_META })
    // 本機紀錄視為未上傳，之後若再登入會重新上傳
    await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs], async () => {
      await Promise.all([
        db.reviewLogs.toCollection().modify({ syncedAt: null }),
        db.cardEvents.toCollection().modify({ syncedAt: null }),
        db.handwritingLogs.toCollection().modify({ syncedAt: null }),
      ])
    })
    return n
  }

  return { push, pull, syncSettings, sync, deleteCloud }
}

/** 下載的 chunk 合併進本機（uuid 聯集），回傳新增筆數與受影響的卡片 */
async function mergeChunk(c: ChunkDoc): Promise<{ count: number; cardIds: Set<string> }> {
  const cardIds = new Set<string>()
  let count = 0
  await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs], async () => {
    count += await addMissing<ReviewLogRecord>(db.reviewLogs, c.reviewLogs, c.createdAt, (r) => cardIds.add(r.cardId))
    count += await addMissing<CardEventRecord>(db.cardEvents, c.cardEvents, c.createdAt, (r) => cardIds.add(r.cardId))
    count += await addMissing<HandwritingLog>(db.handwritingLogs, c.handwritingLogs, c.createdAt)
  })
  return { count, cardIds }
}

async function addMissing<T extends { uuid: string; syncedAt: number | null }>(
  table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkAdd(items: T[]): PromiseLike<unknown> },
  incoming: T[],
  syncedAt: number,
  onAdd?: (r: T) => void,
): Promise<number> {
  if (!incoming.length) return 0
  const existing = await table.bulkGet(incoming.map((r) => r.uuid))
  const seen = new Set<string>()
  const toAdd: T[] = []
  incoming.forEach((r, i) => {
    if (existing[i] !== undefined || seen.has(r.uuid)) return
    seen.add(r.uuid)
    toAdd.push({ ...r, syncedAt })
    onAdd?.(r)
  })
  if (toAdd.length) await table.bulkAdd(toAdd)
  return toAdd.length
}

function strip<T extends { syncedAt: number | null }>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, syncedAt: null }))
}

function takeBatch<R, E, H>(q: { reviews: R[]; events: E[]; hand: H[] }, max: number) {
  const reviews = q.reviews.slice(0, max)
  let left = max - reviews.length
  const events = q.events.slice(0, left)
  left -= events.length
  const hand = q.hand.slice(0, left)
  return {
    reviews,
    events,
    hand,
    rest: { reviews: q.reviews.slice(reviews.length), events: q.events.slice(events.length), hand: q.hand.slice(hand.length) },
  }
}
