import { getFirebase } from './firebaseApp'

/**
 * 紀錄批次（chunk）的上傳與下載（規劃書 §7.3、§7.5）。
 * - 每次同步把尚未上傳的紀錄打包成一份文件，只增不改
 * - createdAt 由伺服器決定（安全規則強制），增量下載以它為基準
 */

export const SCHEMA_VERSION = 1

/** 上傳時的內容；各紀錄表的型別在 P1b 加入後補上 */
export interface ChunkPayload {
  deviceId: string
  schemaVersion: number
  reviewLogs: unknown[]
  cardEvents: unknown[]
  handwritingLogs: unknown[]
  quizLogs: unknown[]
  contentReports: unknown[]
}

export interface ChunkDoc extends ChunkPayload {
  id: string
  /** 伺服器時間（毫秒） */
  createdAt: number
}

export function recordCount(c: ChunkPayload): number {
  return c.reviewLogs.length + c.cardEvents.length + c.handwritingLogs.length + c.quizLogs.length + c.contentReports.length
}

export async function uploadChunk(uid: string, payload: ChunkPayload): Promise<string> {
  const { db } = await getFirebase()
  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore/lite')
  const ref = await addDoc(collection(db, 'users', uid, 'chunks'), { ...payload, createdAt: serverTimestamp() })
  return ref.id
}

/**
 * 下載 chunk；給 sinceMs 時只抓 createdAt >= sinceMs 的（刻意重疊，呼叫端以 uuid 去重）。
 * 回傳依 createdAt 由舊到新排序。
 */
export async function listChunks(uid: string, sinceMs?: number, max = 500): Promise<ChunkDoc[]> {
  const { db } = await getFirebase()
  const { collection, getDocs, limit, orderBy, query, where, Timestamp } = await import('firebase/firestore/lite')
  const col = collection(db, 'users', uid, 'chunks')
  const q = sinceMs
    ? query(col, where('createdAt', '>=', Timestamp.fromMillis(sinceMs)), orderBy('createdAt'), limit(max))
    : query(col, orderBy('createdAt'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data() as Omit<ChunkDoc, 'id' | 'createdAt'> & { createdAt?: { toMillis(): number } }
    return { ...data, id: d.id, createdAt: data.createdAt?.toMillis() ?? 0 }
  })
}

export async function deleteAllChunks(uid: string): Promise<number> {
  const { db } = await getFirebase()
  const { collection, deleteDoc, getDocs } = await import('firebase/firestore/lite')
  const snap = await getDocs(collection(db, 'users', uid, 'chunks'))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  return snap.size
}
