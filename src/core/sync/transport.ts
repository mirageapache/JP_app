import type { HandwritingLog, Setting } from '@/core/db'
import type { CardEventRecord, ReviewLogRecord } from '@/core/srs/types'
import { getFirebase } from './firebaseApp'

/**
 * 雲端傳輸層（規劃書 §7.3）。engine.ts 只透過這個介面存取雲端，測試時可注入假的實作。
 */

export const SCHEMA_VERSION = 1

export interface ChunkPayload {
  deviceId: string
  schemaVersion: number
  reviewLogs: ReviewLogRecord[]
  cardEvents: CardEventRecord[]
  handwritingLogs: HandwritingLog[]
}

export interface ChunkDoc extends ChunkPayload {
  id: string
  /** 伺服器時間（毫秒） */
  createdAt: number
}

/** users/{uid}/settings/main：每個 key 各帶 updatedAt */
export type RemoteSettings = Record<string, { value: unknown; updatedAt: number }>

export interface SyncTransport {
  uploadChunk(uid: string, payload: ChunkPayload): Promise<string>
  /** 下載 createdAt >= sinceMs 的 chunk（刻意重疊），依 createdAt 由舊到新 */
  listChunks(uid: string, sinceMs?: number, max?: number): Promise<ChunkDoc[]>
  getSettings(uid: string): Promise<RemoteSettings>
  setSettings(uid: string, patch: RemoteSettings): Promise<void>
  deleteAll(uid: string): Promise<number>
}

export function settingToRemote(s: Setting): { value: unknown; updatedAt: number } | null {
  return s.updatedAt === null ? null : { value: s.value, updatedAt: s.updatedAt }
}

/** Firestore（lite）實作 */
export const firestoreTransport: SyncTransport = {
  async uploadChunk(uid, payload) {
    const { db } = await getFirebase()
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore/lite')
    const ref = await addDoc(collection(db, 'users', uid, 'chunks'), { ...payload, createdAt: serverTimestamp() })
    return ref.id
  },

  async listChunks(uid, sinceMs, max = 500) {
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
  },

  async getSettings(uid) {
    const { db } = await getFirebase()
    const { doc, getDoc } = await import('firebase/firestore/lite')
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'main'))
    return (snap.exists() ? (snap.data() as RemoteSettings) : {}) ?? {}
  },

  async setSettings(uid, patch) {
    if (Object.keys(patch).length === 0) return
    const { db } = await getFirebase()
    const { doc, setDoc } = await import('firebase/firestore/lite')
    await setDoc(doc(db, 'users', uid, 'settings', 'main'), patch, { merge: true })
  },

  async deleteAll(uid) {
    const { db } = await getFirebase()
    const { collection, deleteDoc, doc, getDocs } = await import('firebase/firestore/lite')
    const snap = await getDocs(collection(db, 'users', uid, 'chunks'))
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
    await deleteDoc(doc(db, 'users', uid, 'settings', 'main')).catch(() => {})
    return snap.size
  },
}
