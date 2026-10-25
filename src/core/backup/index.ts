import { db, type HandwritingLog, type Setting } from '@/core/db'
import { getDeviceId } from '@/core/sync/deviceId'
import { rebuildAllCards } from '@/core/srs/repository'
import type { CardEventRecord, ReviewLogRecord } from '@/core/srs/types'
import { reloadSettings } from '@/core/settings'

/**
 * JSON 匯出／匯入（規劃書 §7.6）：不依賴雲端的備份。
 * - 匯出：各紀錄表與設定，gzip 壓縮，透過分享面板存到「檔案」
 * - 匯入：以 uuid 取聯集合併（不覆蓋）、依 schemaVersion 遷移、匯入前先建立本機快照
 * - cards 不納入（匯入後由紀錄重建）；strokeSamples、errorLogs、syncMeta 不納入
 */

/** 備份檔格式版本；與 Dexie 版本無關，只在匯出內容的結構改變時遞增 */
export const BACKUP_SCHEMA_VERSION = 1

export interface BackupFile {
  schemaVersion: number
  appVersion: string
  exportedAt: string
  deviceId: string
  reviewLogs: ReviewLogRecord[]
  cardEvents: CardEventRecord[]
  handwritingLogs: HandwritingLog[]
  settings: Setting[]
}

export interface ImportSummary {
  added: { reviewLogs: number; cardEvents: number; handwritingLogs: number }
  settingsApplied: boolean
  rebuiltCards: number
}

export async function collectBackup(appVersion: string): Promise<BackupFile> {
  const [reviewLogs, cardEvents, handwritingLogs, settings] = await Promise.all([
    db.reviewLogs.toArray(),
    db.cardEvents.toArray(),
    db.handwritingLogs.toArray(),
    db.settings.toArray(),
  ])
  // 同步狀態是裝置與帳號相關的，不隨備份帶走：匯入到別處時這些紀錄要重新上傳
  const unsynced = <T extends { syncedAt: number | null }>(rows: T[]) => rows.map((r) => ({ ...r, syncedAt: null }))
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    reviewLogs: unsynced(reviewLogs),
    cardEvents: unsynced(cardEvents),
    handwritingLogs: unsynced(handwritingLogs),
    settings,
  }
}

export function backupFileName(gzip: boolean, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `jp-app-backup-${stamp}.json${gzip ? '.gz' : ''}`
}

export function canGzip(): boolean {
  return typeof CompressionStream !== 'undefined'
}

export async function gzipText(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

async function gunzip(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

/** 讀取備份檔：自動辨識 gzip（magic 1f 8b） */
export async function readBackupFile(file: Blob): Promise<BackupFile> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  const text = head[0] === 0x1f && head[1] === 0x8b ? await gunzip(file) : await file.text()
  const parsed = JSON.parse(text) as Partial<BackupFile>
  return migrateBackup(parsed)
}

/** 舊版備份檔遷移（規劃書 §5.3「Schema 遷移」）；目前只有 v1 */
export function migrateBackup(data: Partial<BackupFile>): BackupFile {
  if (typeof data !== 'object' || data === null || !Array.isArray(data.reviewLogs)) throw new Error('不是有效的備份檔')
  const version = data.schemaVersion ?? 1
  if (version > BACKUP_SCHEMA_VERSION) throw new Error(`備份檔版本（${version}）比 App 新，請先更新 App`)
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: data.appVersion ?? 'unknown',
    exportedAt: data.exportedAt ?? '',
    deviceId: data.deviceId ?? 'unknown',
    reviewLogs: data.reviewLogs,
    cardEvents: data.cardEvents ?? [],
    handwritingLogs: data.handwritingLogs ?? [],
    settings: data.settings ?? [],
  }
}

/** 匯入前的本機快照，可回復（存在 Dexie snapshots 表，只保留最近 3 份） */
export async function createSnapshot(appVersion: string): Promise<number> {
  const data = await collectBackup(appVersion)
  const id = await db.snapshots.add({ at: Date.now(), reason: 'import', json: JSON.stringify(data) })
  const all = await db.snapshots.orderBy('at').primaryKeys()
  if (all.length > 3) await db.snapshots.bulkDelete(all.slice(0, all.length - 3))
  return id as number
}

/**
 * 合併匯入：各紀錄表以 uuid 取聯集；設定依選項決定是否以備份檔為準；最後全量重建 cards。
 */
export async function importBackup(input: BackupFile, options: { applySettings: boolean }): Promise<ImportSummary> {
  // 呼叫端可能傳入 Vue reactive Proxy，IndexedDB 無法 structured clone；先轉成純物件
  const data = JSON.parse(JSON.stringify(input)) as BackupFile
  const added = { reviewLogs: 0, cardEvents: 0, handwritingLogs: 0 }
  await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs, db.settings], async () => {
    added.reviewLogs = await addMissing<ReviewLogRecord>(db.reviewLogs, data.reviewLogs)
    added.cardEvents = await addMissing<CardEventRecord>(db.cardEvents, data.cardEvents)
    added.handwritingLogs = await addMissing<HandwritingLog>(db.handwritingLogs, data.handwritingLogs)
    if (options.applySettings) {
      // 以備份檔為準，但裝置範圍的設定（調校模式、引導完成等）維持本機
      for (const s of data.settings) {
        if (s.scope === 'account') await db.settings.put(s)
      }
    }
  })
  if (options.applySettings) await reloadSettings()
  const rebuiltCards = await rebuildAllCards()
  return { added, settingsApplied: options.applySettings, rebuiltCards }
}

/** 只新增本機沒有的 uuid（聯集）；備份內同一 uuid 重複時只取一筆 */
async function addMissing<T extends { uuid: string }>(
  table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkAdd(items: T[]): PromiseLike<unknown> },
  incoming: T[],
): Promise<number> {
  if (incoming.length === 0) return 0
  const existing = await table.bulkGet(incoming.map((r) => r.uuid))
  const seen = new Set<string>()
  const unique: T[] = []
  incoming.forEach((r, i) => {
    if (existing[i] !== undefined || seen.has(r.uuid)) return
    seen.add(r.uuid)
    unique.push(r)
  })
  if (unique.length) await table.bulkAdd(unique)
  return unique.length
}

/** 回復到匯入前的快照：以快照內容取代紀錄（不是合併），再重建 cards */
export async function restoreSnapshot(id: number): Promise<void> {
  const snap = await db.snapshots.get(id)
  if (!snap) throw new Error('找不到快照')
  const data = migrateBackup(JSON.parse(snap.json) as Partial<BackupFile>)
  await db.transaction('rw', [db.reviewLogs, db.cardEvents, db.handwritingLogs, db.settings], async () => {
    await Promise.all([db.reviewLogs.clear(), db.cardEvents.clear(), db.handwritingLogs.clear(), db.settings.clear()])
    await Promise.all([
      db.reviewLogs.bulkAdd(data.reviewLogs),
      db.cardEvents.bulkAdd(data.cardEvents),
      db.handwritingLogs.bulkAdd(data.handwritingLogs),
      db.settings.bulkAdd(data.settings),
    ])
  })
  await reloadSettings()
  await rebuildAllCards()
}
