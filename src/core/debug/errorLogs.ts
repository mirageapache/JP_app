import { db, type ErrorLog } from '@/core/db'

export function listErrorLogs(limit = 300): Promise<ErrorLog[]> {
  return db.errorLogs.orderBy('at').reverse().limit(limit).toArray()
}
export async function clearErrorLogs(): Promise<void> {
  await db.errorLogs.clear()
}
