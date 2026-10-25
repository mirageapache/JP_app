/** SRS 資料型別（規劃書 §5.1、§5.3、§6.2） */

export type CardType = 'kana'
export type Skill = 'read' | 'write'
/** FSRS 評分：1 重來、2 困難、3 良好、4 簡單 */
export type Rating = 1 | 2 | 3 | 4
/** FSRS 狀態：0 New、1 Learning、2 Review、3 Relearning */
export type CardState = 0 | 1 | 2 | 3

/** `cards` 表：由紀錄重建的快取（不同步） */
export interface CardRecord {
  /** 卡片 ID = 項目 ID + # + 技能，例如 kana:あ#write */
  id: string
  itemId: string
  type: CardType
  skill: Skill
  due: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: CardState
  lastReview: number | null
  /** 暫停排程（標記已會、手動暫停） */
  suspended: boolean
  updatedAt: number
}

/** `reviewLogs` 表：SRS 評分紀錄，只增不改，同步 */
export interface ReviewLogRecord {
  uuid: string
  cardId: string
  rating: Rating
  reviewedAt: number
  durationMs: number
  /** session 每日佇列；其他來源（測驗、自由練習）不寫 reviewLogs */
  mode: 'session'
  /** 評分當時生效的 FSRS 參數版本 */
  paramsVersion: string
  deviceId: string
  syncedAt: number | null
}

export type CardEventType = 'markKnown' | 'suspend' | 'unsuspend' | 'reset' | 'paramsChanged'

export interface MarkKnownPayload {
  /** suspend：不再排程；occasional：以長初始穩定度排入，偶爾複習 */
  mode: 'suspend' | 'occasional'
}
export interface ParamsChangedPayload {
  paramsVersion: string
}

/** `cardEvents` 表：非評分操作，只增不改，同步 */
export interface CardEventRecord {
  uuid: string
  /** paramsChanged 為全域事件，cardId 為 '*' */
  cardId: string
  type: CardEventType
  payload?: MarkKnownPayload | ParamsChangedPayload
  at: number
  deviceId: string
  syncedAt: number | null
}
