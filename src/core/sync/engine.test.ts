import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/core/db'
import { resetSettingsCache, setSetting } from '@/core/settings'
import { recordReview } from '@/core/srs/repository'
import { CHUNK_MAX_BYTES, CHUNK_MAX_RECORDS, countPending, createSyncEngine, getSyncMeta, PULL_PAGE } from './engine'
import type { ChunkDoc, ChunkPayload, RemoteSettings, SyncTransport } from './transport'
import { getDeviceId } from './deviceId'

const T0 = Date.UTC(2026, 9, 25, 2, 0, 0)

/** 記憶體版雲端：模擬 serverTimestamp 遞增 */
function fakeCloud() {
  const chunks: ChunkDoc[] = []
  let settings: RemoteSettings = {}
  let clock = 1_000
  const transport: SyncTransport = {
    async uploadChunk(_uid, payload: ChunkPayload) {
      const id = `c${chunks.length + 1}`
      chunks.push({ ...payload, id, createdAt: (clock += 10) })
      return id
    },
    async listChunks(_uid, sinceMs) {
      return chunks.filter((c) => sinceMs === undefined || c.createdAt >= sinceMs).sort((a, b) => a.createdAt - b.createdAt)
    },
    async getSettings() {
      return { ...settings }
    },
    async setSettings(_uid, patch) {
      settings = { ...settings, ...patch }
    },
    async deleteAll() {
      const n = chunks.length
      chunks.length = 0
      settings = {}
      return n
    },
  }
  return { transport, chunks, get settings() { return settings } }
}

describe('同步引擎', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.cardEvents.clear(), db.handwritingLogs.clear(), db.settings.clear(), db.syncMeta.clear()])
    resetSettingsCache()
  })

  it('上傳未同步的紀錄並標記 syncedAt；再上傳時沒有東西', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    await recordReview('kana:あ#read', 3, 1000, T0)
    await recordReview('kana:い#read', 3, 1000, T0 + 1)
    expect(await countPending()).toBe(2)
    expect(await engine.push('u1')).toBe(2)
    expect(cloud.chunks).toHaveLength(1)
    expect(cloud.chunks[0]!.reviewLogs[0]!.syncedAt).toBeNull()
    expect(await countPending()).toBe(0)
    expect(await engine.push('u1')).toBe(0)
  })

  it('紀錄多時切成多個 chunk', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    const rows = Array.from({ length: CHUNK_MAX_RECORDS + 5 }, (_, i) => ({
      uuid: `r${i}`, cardId: 'kana:あ#read', rating: 3 as const, reviewedAt: T0 + i, durationMs: 1, mode: 'session' as const,
      paramsVersion: 'fsrs-default-v1', deviceId: getDeviceId(), syncedAt: null,
    }))
    await db.reviewLogs.bulkAdd(rows)
    expect(await engine.push('u1')).toBe(CHUNK_MAX_RECORDS + 5)
    expect(cloud.chunks).toHaveLength(2)
  })

  it('下載其他裝置的 chunk：合併、去重、忽略自己的、重建受影響卡片、更新 lastPulledAt', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    // 自己上傳一筆
    await recordReview('kana:あ#read', 3, 1000, T0)
    await engine.sync('u1')
    // 另一台裝置上傳
    const other: ChunkPayload = {
      deviceId: 'other-device', schemaVersion: 1,
      reviewLogs: [
        { uuid: 'o1', cardId: 'kana:い#read', rating: 4, reviewedAt: T0 + 5, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other-device', syncedAt: null },
        { uuid: 'o1', cardId: 'kana:い#read', rating: 4, reviewedAt: T0 + 5, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other-device', syncedAt: null },
      ],
      cardEvents: [{ uuid: 'oe1', cardId: 'kana:う#read', type: 'markKnown', payload: { mode: 'suspend' }, at: T0 + 6, deviceId: 'other-device', syncedAt: null }],
      handwritingLogs: [],
    }
    await cloud.transport.uploadChunk('u1', other)
    const r = await engine.sync('u1')
    expect(r.pulled).toBe(2)
    expect(r.rebuiltCards).toBe(2)
    expect((await db.cards.get('kana:い#read'))?.reps).toBe(1)
    expect((await db.cards.get('kana:う#read'))?.suspended).toBe(true)
    // 下載進來的紀錄已標記為同步，不會再上傳
    expect(await countPending()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(2)
    const meta = await getSyncMeta()
    expect(meta.lastPulledAt).toBe(cloud.chunks.at(-1)!.createdAt)
    // 再同步一次：沒有新東西
    const r2 = await engine.sync('u1')
    expect(r2.pulled).toBe(0)
    expect(r2.pushed).toBe(0)
  })

  it('設定：先下載較新的，再只上傳實際修改過的 account 設定；新裝置預設值不會蓋掉雲端', async () => {
    const cloud = fakeCloud()
    await cloud.transport.setSettings('u1', { dailyNewKana: { value: 9, updatedAt: 500 }, tuningMode: { value: true, updatedAt: 500 } })
    const engine = createSyncEngine(cloud.transport)
    // 本機尚未修改任何設定（updatedAt 全為 null）→ 雲端為準，且 device 範圍不套用
    const r = await engine.sync('u1')
    expect(r.settingsPulled).toBe(1)
    expect((await db.settings.get('dailyNewKana'))?.value).toBe(9)
    expect(await db.settings.get('tuningMode')).toBeUndefined()
    expect(r.settingsPushed).toBe(0)
    // 本機修改（較新）→ 上傳
    await setSetting('dailyGoalMinutes', 25)
    await setSetting('tuningMode', true) // device 範圍不上傳
    const r2 = await engine.sync('u1')
    expect(r2.settingsPushed).toBe(1)
    expect(cloud.settings.dailyGoalMinutes?.value).toBe(25)
    expect(cloud.settings.tuningMode?.value).toBe(true) // 原本雲端就有，維持不變
  })

  it('本機資料被清但 deviceId 還在：首次下載不略過自己的 chunk，能還原', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    await recordReview('kana:あ#read', 3, 1000, T0)
    await engine.sync('u1')
    // 模擬 IndexedDB 被清除（deviceId 存在 localStorage，不變）
    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.syncMeta.clear()])
    const r = await engine.sync('u1')
    expect(r.pulled).toBe(1)
    expect(await db.reviewLogs.count()).toBe(1)
    expect((await db.cards.get('kana:あ#read'))?.reps).toBe(1)
    expect((await getSyncMeta()).lastSyncAt).toBeTypeOf('number')
  })

  it('chunk 超過一頁時會分頁續抓', async () => {
    const cloud = fakeCloud()
    for (let i = 0; i < PULL_PAGE + 3; i++) {
      await cloud.transport.uploadChunk('u1', {
        deviceId: 'other',
        schemaVersion: 1,
        reviewLogs: [{ uuid: `p${i}`, cardId: 'kana:あ#read', rating: 3, reviewedAt: T0 + i, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other', syncedAt: null }],
        cardEvents: [],
        handwritingLogs: [],
      })
    }
    const engine = createSyncEngine(cloud.transport)
    const r = await engine.sync('u1')
    expect(r.pulled).toBe(PULL_PAGE + 3)
  })

  it('手寫紀錄大時依位元組切 chunk，每份都在上限內', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    // 每筆約 3 KB：300 筆 ≈ 1 MB，只以筆數（400）切會超過 Firestore 的 1 MiB
    const rows = Array.from({ length: 300 }, (_, i) => ({
      uuid: `h${i}`, cardId: 'kana:あ#write', variantId: 'kanjivg', difficulty: 'blank' as const, pointerType: 'touch' as const, score: 50,
      strokeResults: Array.from({ length: 60 }, (_, k) => ({ strokeIndex: k % 3, kind: 'shape' as const, difficulty: 'blank' as const })),
      misses: 30, hintsUsed: 1, skipped: false, durationMs: 60000, mode: 'free' as const, at: T0 + i, syncedAt: null,
    }))
    await db.handwritingLogs.bulkAdd(rows)
    expect(await engine.push('u1')).toBe(300)
    expect(cloud.chunks.length).toBeGreaterThan(1)
    for (const c of cloud.chunks) expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(CHUNK_MAX_BYTES + 200)
  })

  it('下載後重建中斷（dirtyCardIds 殘留）會在下一輪補做', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    // 模擬：紀錄已合併進本機、dirty 已記下，但 rebuild 沒跑完就被殺
    await db.reviewLogs.add({ uuid: 'x1', cardId: 'kana:い#read', rating: 3, reviewedAt: T0, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other', syncedAt: 1 })
    await db.syncMeta.put({ key: 'main', uid: 'u1', lastPulledAt: 5000, lastPushedAt: null, lastSettingsPushAt: null, lastSyncAt: null, dirtyCardIds: ['kana:い#read'], lastError: null })
    expect(await db.cards.get('kana:い#read')).toBeUndefined()
    const r = await engine.sync('u1')
    expect(r.rebuiltCards).toBe(1)
    expect((await db.cards.get('kana:い#read'))?.reps).toBe(1)
    expect((await getSyncMeta()).dirtyCardIds).toEqual([])
  })

  it('chunk 內格式不對的列與較新 schema 的 chunk 會略過，不寫進本機', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    await cloud.transport.uploadChunk('u1', {
      deviceId: 'other', schemaVersion: 1,
      reviewLogs: [
        { uuid: 'ok1', cardId: 'kana:あ#read', rating: 3, reviewedAt: T0, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other', syncedAt: null },
        { uuid: 'bad1', cardId: 'kana:あ#read', rating: 9, reviewedAt: T0, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other', syncedAt: null } as never,
        { uuid: 'bad2', cardId: 'kana:あ#read', rating: 3, reviewedAt: 'yesterday', durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other', syncedAt: null } as never,
      ],
      cardEvents: [{ uuid: 'bad3', cardId: 'kana:う#read', type: 'explode', at: T0, deviceId: 'other', syncedAt: null } as never],
      handwritingLogs: [],
    })
    await cloud.transport.uploadChunk('u1', {
      deviceId: 'other', schemaVersion: 99,
      reviewLogs: [{ uuid: 'future', cardId: 'kana:え#read', rating: 3, reviewedAt: T0, durationMs: 1, mode: 'session', paramsVersion: 'fsrs-default-v1', deviceId: 'other', syncedAt: null }],
      cardEvents: [], handwritingLogs: [],
    })
    const r = await engine.sync('u1')
    expect(r.pulled).toBe(1)
    expect(await db.reviewLogs.count()).toBe(1)
    expect(await db.cardEvents.count()).toBe(0)
    expect((await db.cards.get('kana:あ#read'))?.reps).toBe(1)
  })

  it('雲端設定型別不對或缺 updatedAt 時略過，不套用也不炸', async () => {
    const cloud = fakeCloud()
    await cloud.transport.setSettings('u1', {
      dailyNewKana: { value: '5', updatedAt: 500 },
      dailyGoalMinutes: { value: 30 } as never,
      notAKey: { value: 1, updatedAt: 500 },
      newPauseThreshold: { value: 50, updatedAt: 500 },
    })
    const engine = createSyncEngine(cloud.transport)
    const r = await engine.sync('u1')
    expect(r.settingsPulled).toBe(1)
    expect(await db.settings.get('dailyNewKana')).toBeUndefined()
    expect(await db.settings.get('dailyGoalMinutes')).toBeUndefined()
    expect((await db.settings.get('newPauseThreshold'))?.value).toBe(50)
  })

  it('換帳號會重設下載基準並把紀錄標回未上傳；刪除雲端後本機紀錄回到未同步', async () => {
    const cloud = fakeCloud()
    const engine = createSyncEngine(cloud.transport)
    await recordReview('kana:あ#read', 3, 1000, T0)
    await engine.sync('u1')
    expect((await getSyncMeta()).uid).toBe('u1')
    const before = cloud.chunks.length
    await engine.sync('u2')
    expect((await getSyncMeta()).uid).toBe('u2')
    expect(cloud.chunks.length).toBe(before + 1) // 舊紀錄重新上傳到新帳號
    expect(await engine.deleteCloud('u2')).toBeGreaterThan(0)
    expect(await countPending()).toBe(1)
    expect((await getSyncMeta()).uid).toBeNull()
  })
})
