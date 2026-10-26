import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/core/db'
import { recordReview, markKnown } from '@/core/srs/repository'
import { resetSettingsCache, setSetting } from '@/core/settings'
import { collectBackup, createSnapshot, importBackup, migrateBackup, readBackupFile, restoreSnapshot } from './index'

const T0 = Date.UTC(2026, 9, 25, 2, 0, 0)

describe('備份與還原', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.cardEvents.clear(), db.handwritingLogs.clear(), db.settings.clear(), db.snapshots.clear()])
    resetSettingsCache()
  })

  it('匯出包含紀錄與設定，不含 cards', async () => {
    await recordReview('kana:あ#read', 3, 1000, T0)
    await setSetting('dailyNewKana', 7)
    const b = await collectBackup('0.1.0')
    expect(b.reviewLogs).toHaveLength(1)
    expect(b.settings.find((s) => s.key === 'dailyNewKana')?.value).toBe(7)
    expect('cards' in b).toBe(false)
    expect(b.reviewLogs[0]!.syncedAt).toBeNull()
  })

  it('readBackupFile 可讀 JSON 與 gzip；舊版欄位缺漏時補預設', async () => {
    const json = JSON.stringify({ schemaVersion: 1, reviewLogs: [] })
    const plain = await readBackupFile(new Blob([json]))
    expect(plain.cardEvents).toEqual([])
    const gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
    const fromGz = await readBackupFile(gz)
    expect(fromGz.schemaVersion).toBe(1)
    expect(() => migrateBackup({} as never)).toThrow('不是有效的備份檔')
    expect(() => migrateBackup({ schemaVersion: 99, reviewLogs: [] })).toThrow(/比 App 新/)
  })

  it('migrateBackup 會略過格式不對的紀錄、丟掉不認識或型別不對的設定、補上 updatedAt 與正確 scope', () => {
    const b = migrateBackup({
      schemaVersion: 1,
      reviewLogs: [
        { uuid: 'ok', cardId: 'kana:あ#read', rating: 3, reviewedAt: 1, durationMs: 1, mode: 'session', paramsVersion: 'v', deviceId: 'd', syncedAt: null },
        { uuid: 'bad', cardId: 'kana:あ#read', rating: 3, reviewedAt: NaN, durationMs: 1, mode: 'session', paramsVersion: 'v', deviceId: 'd', syncedAt: null },
        'garbage' as never,
      ],
      settings: [
        { key: 'dailyNewKana', value: 9, scope: 'device', updatedAt: undefined as never },
        { key: 'dailyGoalMinutes', value: '20', scope: 'account', updatedAt: 1 },
        { key: 'somethingElse', value: 1, scope: 'account', updatedAt: 1 },
        { key: 'tuningMode', value: true, scope: 'account', updatedAt: 1 },
      ],
    })
    expect(b.reviewLogs.map((r) => r.uuid)).toEqual(['ok'])
    expect(b.skipped).toBe(2)
    expect(b.settings.map((s) => s.key).sort()).toEqual(['dailyNewKana', 'tuningMode'])
    const daily = b.settings.find((s) => s.key === 'dailyNewKana')!
    expect(daily.scope).toBe('account')
    expect(daily.updatedAt).toBeTypeOf('number')
    expect(b.settings.find((s) => s.key === 'tuningMode')!.scope).toBe('device')
  })

  it('匯入以 uuid 取聯集，不重複、不覆蓋，並重建 cards', async () => {
    const { log } = await recordReview('kana:あ#read', 3, 1000, T0)
    const foreign = { ...log, uuid: 'other-device-1', cardId: 'kana:い#read', reviewedAt: T0 + 1000 }
    const summary = await importBackup(
      { schemaVersion: 1, appVersion: 'x', exportedAt: '', deviceId: 'd2', reviewLogs: [log, foreign, foreign], cardEvents: [], handwritingLogs: [], settings: [] },
      { applySettings: false },
    )
    expect(summary.added.reviewLogs).toBe(1)
    expect(await db.reviewLogs.count()).toBe(2)
    expect((await db.cards.get('kana:い#read'))?.reps).toBe(1)
  })

  it('匯入設定只套用 account 範圍；快照可回復', async () => {
    await setSetting('dailyNewKana', 3)
    await setSetting('tuningMode', true)
    await markKnown(['kana:う#read'], 'suspend', T0)
    const snapId = await createSnapshot('0.1.0')

    await importBackup(
      {
        schemaVersion: 1,
        appVersion: 'x',
        exportedAt: '',
        deviceId: 'd2',
        reviewLogs: [],
        cardEvents: [],
        handwritingLogs: [],
        settings: [
          { key: 'dailyNewKana', value: 9, scope: 'account', updatedAt: 1 },
          { key: 'tuningMode', value: false, scope: 'device', updatedAt: 1 },
        ],
      },
      { applySettings: true },
    )
    expect((await db.settings.get('dailyNewKana'))?.value).toBe(9)
    expect((await db.settings.get('tuningMode'))?.value).toBe(true)

    await restoreSnapshot(snapId)
    expect((await db.settings.get('dailyNewKana'))?.value).toBe(3)
    expect((await db.cards.get('kana:う#read'))?.suspended).toBe(true)
  })
})
