import Dexie, { type EntityTable } from 'dexie'

/** 除錯面板用的錯誤／console 紀錄（規劃書 §5.3 `errorLogs`，不同步） */
export interface ErrorLog {
  id?: number
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  stack?: string
  at: number
}

/**
 * 本機資料庫。每次 schema 變更都升版本號並寫遷移（規劃書 §5.3「Schema 遷移」）。
 * 其餘資料表（cards、reviewLogs…）於 P1a／P1b 加入。
 */
export class JpAppDB extends Dexie {
  errorLogs!: EntityTable<ErrorLog, 'id'>

  constructor(name = 'jp-app') {
    super(name)
    this.version(1).stores({
      errorLogs: '++id, at, level',
    })
  }
}

export const db = new JpAppDB()
