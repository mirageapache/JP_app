import Dexie, { type EntityTable } from 'dexie'
import type { Difficulty, Point, Verdict, VerdictKind } from '@/core/handwriting/types'

/**
 * 本機資料庫（規劃書 §5.3）。每次 schema 變更都升版本號並寫遷移。
 * v1：errorLogs
 * v2：handwritingLogs、strokeSamples、settings（P1a）
 * 其餘資料表（cards、reviewLogs、cardEvents…）於 P1b 加入。
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
  difficulty: Difficulty
  pointerType: 'pen' | 'touch' | 'mouse'
  /** 0～100 */
  score: number
  strokeResults: { strokeIndex: number; kind: VerdictKind }[]
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
  }
}

export const db = new JpAppDB()
