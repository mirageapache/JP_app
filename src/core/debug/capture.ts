import type { App } from 'vue'
import { db, type ErrorLog } from '@/core/db'

/**
 * 錯誤與 console 收集（規劃書 F16）。
 * 開發機是 Windows，無法用 Safari 遠端除錯 iPhone，所以把 console 輸出與未捕捉的錯誤
 * 寫進 Dexie，讓除錯面板在手機上直接查看。
 */

const MAX_ENTRIES = 500
const PRUNE_EVERY = 50
type Level = ErrorLog['level']

let installed = false
let writesSincePrune = 0
let onError: ((e: ErrorEvent) => void) | undefined
let onRejection: ((e: PromiseRejectionEvent) => void) | undefined
const originalConsole: Partial<Record<Level, (...args: unknown[]) => void>> = {}

function formatArg(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}`
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function stackOf(args: unknown[]): string | undefined {
  const err = args.find((a): a is Error => a instanceof Error)
  return err?.stack
}

/** 寫入一筆紀錄；內部絕不呼叫 console，避免遞迴 */
export async function record(level: Level, message: string, stack?: string): Promise<void> {
  try {
    await db.errorLogs.add({ level, message, stack, at: Date.now() })
    if (++writesSincePrune >= PRUNE_EVERY) {
      writesSincePrune = 0
      await prune()
    }
  } catch {
    // 儲存失敗（例如隱私模式）時靜默略過，不能影響 App
  }
}

async function prune(): Promise<void> {
  const count = await db.errorLogs.count()
  if (count <= MAX_ENTRIES) return
  const oldest = await db.errorLogs.orderBy('at').limit(count - MAX_ENTRIES).primaryKeys()
  await db.errorLogs.bulkDelete(oldest)
}

export function installErrorCapture(app?: App): void {
  if (installed) return
  installed = true

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    originalConsole[level] = original
    console[level] = (...args: unknown[]) => {
      original(...args)
      void record(level, args.map(formatArg).join(' '), stackOf(args))
    }
  }

  onError = (e) => {
    void record('error', `${e.message} (${e.filename}:${e.lineno}:${e.colno})`, e.error?.stack)
  }
  onRejection = (e) => {
    const reason: unknown = e.reason
    void record('error', `未處理的 Promise 拒絕：${formatArg(reason)}`, stackOf([reason]))
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  if (app) {
    app.config.errorHandler = (err, _instance, info) => {
      void record('error', `Vue 錯誤（${info}）：${formatArg(err)}`, stackOf([err]))
      originalConsole.error?.(err)
    }
  }
}

/** 測試用：還原 console 並允許重新安裝 */
export function uninstallErrorCapture(): void {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = originalConsole[level]
    if (original) console[level] = original
  }
  if (onError) window.removeEventListener('error', onError)
  if (onRejection) window.removeEventListener('unhandledrejection', onRejection)
  onError = onRejection = undefined
  installed = false
}
