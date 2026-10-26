import { db, type HandwritingLog } from '@/core/db'
import { filterValid, isCardEvent, isHandwritingLog, isReviewLog } from '@/core/db/validate'
import { isValidSetting, reloadSettings, SETTING_SCOPE } from '@/core/settings'
import { rebuildCards } from '@/core/srs/repository'
import type { CardEventRecord, ReviewLogRecord } from '@/core/srs/types'
import { getDeviceId } from './deviceId'
import { SCHEMA_VERSION, type ChunkDoc, type ChunkPayload, type RemoteSettings, type SyncTransport } from './transport'
import { errorMessage } from '@/core/util/errors'

/**
 * 同步引擎（規劃書 §7.5）：
 * - 上傳：把 syncedAt 為 null 的紀錄打包成 chunk；成功後才標記 syncedAt
 * - 下載：lastPulledAt = 上次下載到的 chunk 中最大的 createdAt（伺服器時間）；用 >= 重疊查詢、uuid 去重；
 *   非首次下載時略過自己裝置的 chunk；受影響的卡片 ID 先寫進 syncMeta.dirtyCardIds（與合併同一交易），
 *   再重建——中途被殺也會在下一輪補做，不會留下與紀錄不一致的 cards
 * - 設定：先下載再上傳；只上傳使用者實際修改過的 key（updatedAt 不為 null）；以 updatedAt 較新者為準
 */

/** 單一 chunk 的紀錄數上限 */
export const CHUNK_MAX_RECORDS = 400
/** 單一 chunk 的位元組上限（Firestore 文件 1 MiB，欄位名稱也算；手寫紀錄每筆 2～3 KB，只以筆數切會超過） */
export const CHUNK_MAX_BYTES = 700_000
/** 下載一頁的 chunk 數 */
export const PULL_PAGE = 200

export interface SyncMeta {
  key: 'main'
  uid: string | null
  lastPulledAt: number | null
  lastPushedAt: number | null
  lastSettingsPushAt: number | null
  /** 最近一次成功完成整輪同步的時間（即使沒有東西要傳） */
  lastSyncAt: number | null
  /** 已合併進本機但尚未重建的卡片（下載中斷的保險） */
  dirtyCardIds: string[]
  lastError: string | null
}

export interface SyncResult {
  pushed: number
  pulled: number
  rebuiltCards: number
  settingsPulled: number
  settingsPushed: number
}

const EMPTY_META: SyncMeta = { key: 'main', uid: null, lastPulledAt: null, lastPushedAt: null, lastSettingsPushAt: null, lastSyncAt: null, dirtyCardIds: [], lastError: null }

/** 把所有紀錄標回未上傳（換帳號、刪除雲端後） */
async function markAllUnsynced(): Promise<void> {
  await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs], async () => {
    await Promise.all([
      db.reviewLogs.toCollection().modify({ syncedAt: null }),
      db.cardEvents.toCollection().modify({ syncedAt: null }),
      db.handwritingLogs.toCollection().modify({ syncedAt: null }),
    ])
  })
}

export async function getSyncMeta(): Promise<SyncMeta> {
  // 舊版存的 meta 可能缺後來加的欄位（dirtyCardIds）
  return { ...EMPTY_META, ...(await db.syncMeta.get('main')) }
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
    if (meta.uid === uid) return
    // 換了帳號：下載基準不適用，從頭下載；本機紀錄全部視為未上傳，才會進到新帳號。
    // 兩步放同一交易：若只登記了新帳號、沒標回未上傳，舊紀錄永遠進不了新帳號
    await db.transaction('rw', [db.syncMeta, db.reviewLogs, db.cardEvents, db.handwritingLogs], async () => {
      await db.syncMeta.put({ ...EMPTY_META, uid })
      if (meta.uid !== null) await markAllUnsynced()
    })
  }

  /** 把 dirtyCardIds 裡的卡片重建並清空；下載中斷後的下一輪會在這裡補做 */
  async function rebuildDirty(now = Date.now()): Promise<number> {
    const meta = await getSyncMeta()
    if (meta.dirtyCardIds.length === 0) return 0
    const ids = new Set(meta.dirtyCardIds)
    await db.transaction('rw', [db.cardEvents, db.reviewLogs, db.cards, db.syncMeta], async () => {
      await rebuildCards(ids, now)
      const cur = await getSyncMeta()
      await db.syncMeta.put({ ...cur, dirtyCardIds: [] })
    })
    return ids.size
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
    // 依筆數與位元組上限切成多個 chunk
    let queue: { reviews: ReviewLogRecord[]; events: CardEventRecord[]; hand: HandwritingLog[] } = { reviews, events, hand }
    while (queue.reviews.length + queue.events.length + queue.hand.length > 0) {
      const batch = takeBatch(queue, CHUNK_MAX_RECORDS, CHUNK_MAX_BYTES)
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
    const deviceId = getDeviceId()
    // 首次（或重設後）全量下載時不略過自己裝置的 chunk：本機 IndexedDB 被清但 localStorage 的 deviceId 還在時，才還原得回來
    const skipOwn = meta.lastPulledAt !== null
    let pulled = 0
    let maxCreated = meta.lastPulledAt ?? 0
    let since = meta.lastPulledAt ?? undefined
    let any = false
    // 分頁：一次最多 PULL_PAGE 份，拿滿就以最後一份的 createdAt 繼續（>= 重疊，uuid 去重）
    for (;;) {
      const chunks = await transport.listChunks(uid, since, PULL_PAGE)
      for (const c of chunks) {
        maxCreated = Math.max(maxCreated, c.createdAt)
        if (skipOwn && c.deviceId === deviceId) continue
        pulled += await mergeChunk(c)
      }
      any ||= chunks.length > 0
      if (chunks.length < PULL_PAGE) break
      const last = chunks[chunks.length - 1]!.createdAt
      if (since !== undefined && last <= since) break // 同一時間戳超過一頁，避免無窮迴圈
      since = last
    }
    const rebuiltCards = await rebuildDirty()
    if (any) await patchMeta({ lastPulledAt: maxCreated })
    return { pulled, rebuiltCards }
  }

  /** 設定：先下載（較新者為準），再上傳本機修改過且更新時間晚於上次上傳的 key */
  async function syncSettings(uid: string, now = Date.now()): Promise<{ pulled: number; pushed: number }> {
    const remote = await transport.getSettings(uid)
    const local = await db.settings.toArray()
    const localByKey = new Map(local.map((s) => [s.key, s]))
    let pulled = 0
    for (const [key, r] of Object.entries(remote)) {
      // 雲端的值不信任：key 不認識、型別不對、updatedAt 不是數字都略過
      if (typeof r !== 'object' || r === null || !Number.isFinite(r.updatedAt)) continue
      if (!isValidSetting(key, r.value) || SETTING_SCOPE[key] !== 'account') continue
      const l = localByKey.get(key)
      if (!l || l.updatedAt === null || r.updatedAt > l.updatedAt) {
        await db.settings.put({ key, value: r.value, scope: 'account', updatedAt: r.updatedAt })
        pulled++
      }
    }
    if (pulled) await reloadSettings()

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

  /** 完整一輪：補做上次中斷的重建 → 設定下載 → 下載紀錄 → 上傳紀錄 → 設定上傳 */
  async function sync(uid: string): Promise<SyncResult> {
    await ensureUid(uid)
    try {
      const leftover = await rebuildDirty()
      const s = await syncSettings(uid)
      const p = await pull(uid)
      const pushed = await push(uid)
      await patchMeta({ lastError: null, lastSyncAt: Date.now() })
      return { pushed, pulled: p.pulled, rebuiltCards: leftover + p.rebuiltCards, settingsPulled: s.pulled, settingsPushed: s.pushed }
    } catch (e) {
      await patchMeta({ lastError: errorMessage(e) })
      throw e
    }
  }

  /** 刪除雲端資料並清除同步基準（本機資料保留） */
  async function deleteCloud(uid: string): Promise<number> {
    const n = await transport.deleteAll(uid)
    await db.syncMeta.put({ ...EMPTY_META })
    // 本機紀錄視為未上傳，之後若再登入會重新上傳
    await markAllUnsynced()
    return n
  }

  return { push, pull, syncSettings, sync, rebuildDirty, deleteCloud }
}

/**
 * 下載的 chunk 合併進本機（uuid 聯集），受影響的卡片 ID 在同一交易內記進 dirtyCardIds。
 * 格式不對的列略過；schema 比本機新的 chunk 整份略過（等 App 更新後重新下載）。
 */
async function mergeChunk(c: ChunkDoc): Promise<number> {
  if (typeof c.schemaVersion === 'number' && c.schemaVersion > SCHEMA_VERSION) {
    console.warn(`略過較新版本的同步資料（schema ${c.schemaVersion}），請更新 App`)
    return 0
  }
  const reviews = filterValid(c.reviewLogs, isReviewLog)
  const events = filterValid(c.cardEvents, isCardEvent)
  const hand = filterValid(c.handwritingLogs, isHandwritingLog)
  const skipped = reviews.skipped + events.skipped + hand.skipped
  if (skipped) console.warn(`同步資料中有 ${skipped} 筆格式不正確，已略過（chunk ${c.id}）`)
  const cardIds = new Set<string>()
  let count = 0
  await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs, db.syncMeta], async () => {
    count += await addMissing<ReviewLogRecord>(db.reviewLogs, reviews.rows, c.createdAt, (r) => cardIds.add(r.cardId))
    count += await addMissing<CardEventRecord>(db.cardEvents, events.rows, c.createdAt, (r) => cardIds.add(r.cardId))
    count += await addMissing<HandwritingLog>(db.handwritingLogs, hand.rows, c.createdAt)
    if (cardIds.size) {
      const cur = await getSyncMeta()
      await db.syncMeta.put({ ...cur, dirtyCardIds: [...new Set([...cur.dirtyCardIds, ...cardIds])] })
    }
  })
  return count
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

const encoder = new TextEncoder()
const byteSize = (r: unknown) => encoder.encode(JSON.stringify(r)).length

/** 依序取 reviews → events → hand，直到筆數或位元組達上限；至少取一筆，否則單筆過大會卡死 */
function takeBatch<R, E, H>(q: { reviews: R[]; events: E[]; hand: H[] }, maxRecords: number, maxBytes: number) {
  let n = 0
  let bytes = 0
  let full = false
  const take = <T>(src: T[]): { taken: T[]; rest: T[] } => {
    let i = 0
    while (!full && i < src.length) {
      const size = byteSize(src[i])
      if (n > 0 && (n >= maxRecords || bytes + size > maxBytes)) {
        full = true
        break
      }
      n++
      bytes += size
      i++
    }
    return { taken: src.slice(0, i), rest: src.slice(i) }
  }
  const reviews = take(q.reviews)
  const events = take(q.events)
  const hand = take(q.hand)
  return { reviews: reviews.taken, events: events.taken, hand: hand.taken, rest: { reviews: reviews.rest, events: events.rest, hand: hand.rest } }
}
