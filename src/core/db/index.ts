import Dexie, { type EntityTable } from 'dexie'
import type { Difficulty, Point, Verdict, VerdictKind } from '@/core/handwriting/types'
import type { CardEventRecord, CardRecord, ReviewLogRecord } from '@/core/srs/types'

/**
 * 本機資料庫（規劃書 §5.3）。每次 schema 變更都升版本號並寫遷移。
 * v1：errorLogs
 * v2：handwritingLogs、strokeSamples、settings（P1a）
 * v3：cards（快取）、reviewLogs、cardEvents（P1b）
 * v4：snapshots（匯入前快照）
 */

/** 除錯面板用的錯誤／console 紀錄，不同步 */
export interface ErrorLog {
  id?: number
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  stack?: string
  at: number
}

/** 手寫練習紀錄：只存每一筆的判定結果，不存座標；同步到雲端 */
export interface HandwritingLog {
  uuid: string
  /** 卡片 ID，例如 kana:あ#write */
  cardId: string
  variantId: string
  /** 開始時的難度；中途切換時以各筆 strokeResults.difficulty 為準 */
  difficulty: Difficulty
  /** 沒寫任何一筆就跳過時為 null */
  pointerType: 'pen' | 'touch' | 'mouse' | null
  /** 0～100 */
  score: number
  strokeResults: { strokeIndex: number; kind: VerdictKind; difficulty: Difficulty }[]
  misses: number
  hintsUsed: number
  skipped: boolean
  durationMs: number
  /** 'free' 自由練習；'session' 每日佇列（P1b） */
  mode: 'free' | 'session'
  at: number
  /** null = 尚未上傳（P1.5 同步） */
  syncedAt: number | null
}

/** 調校模式才寫入的筆跡樣本：含原始座標；不同步、不入一般備份 */
export interface StrokeSample {
  uuid: string
  cardId: string
  variantId: string
  strokeIndex: number
  difficulty: Difficulty
  pointerType: 'pen' | 'touch' | 'mouse'
  points: Point[]
  durationMs: number
  verdict: Pick<Verdict, 'kind' | 'matchedIndex' | 'metrics'>
  /** 人工標記：null 未標記、true 判定正確、false 判定有誤 */
  judgedCorrect: boolean | null
  recordedAt: number
}

/** 匯入前的本機快照（規劃書 §7.6），不同步 */
export interface Snapshot {
  id?: number
  at: number
  reason: 'import'
  /** 備份檔 JSON 字串 */
  json: string
}

/** 設定：account 範圍會同步（P1.5），device 範圍只在本機 */
export interface Setting {
  key: string
  value: unknown
  scope: 'account' | 'device'
  /** 只在使用者實際修改時更新；初始化預設值為 null */
  updatedAt: number | null
}

export class JpAppDB extends Dexie {
  errorLogs!: EntityTable<ErrorLog, 'id'>
  handwritingLogs!: EntityTable<HandwritingLog, 'uuid'>
  strokeSamples!: EntityTable<StrokeSample, 'uuid'>
  settings!: EntityTable<Setting, 'key'>
  cards!: EntityTable<CardRecord, 'id'>
  reviewLogs!: EntityTable<ReviewLogRecord, 'uuid'>
  cardEvents!: EntityTable<CardEventRecord, 'uuid'>
  snapshots!: EntityTable<Snapshot, 'id'>

  constructor(name = 'jp-app') {
    super(name)
    this.version(1).stores({
      errorLogs: '++id, at, level',
    })
    this.version(2).stores({
      errorLogs: '++id, at, level',
      handwritingLogs: 'uuid, cardId, at, syncedAt',
      strokeSamples: 'uuid, cardId, recordedAt',
      settings: 'key, scope',
    })
    this.version(3).stores({
      errorLogs: '++id, at, level',
      handwritingLogs: 'uuid, cardId, at, syncedAt',
      strokeSamples: 'uuid, cardId, recordedAt',
      settings: 'key, scope',
      cards: 'id, itemId, skill, due, state',
      reviewLogs: 'uuid, cardId, reviewedAt, syncedAt',
      cardEvents: 'uuid, cardId, at, syncedAt',
    })
    this.version(4).stores({
      errorLogs: '++id, at, level',
      handwritingLogs: 'uuid, cardId, at, syncedAt',
      strokeSamples: 'uuid, cardId, recordedAt',
      settings: 'key, scope',
      cards: 'id, itemId, skill, due, state',
      reviewLogs: 'uuid, cardId, reviewedAt, syncedAt',
      cardEvents: 'uuid, cardId, at, syncedAt',
      snapshots: '++id, at',
    })
  }
}

export const db = new JpAppDB()
