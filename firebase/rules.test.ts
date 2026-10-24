/**
 * Firestore 安全規則測試（規劃書 §7.4）。
 * 需要 Firestore Emulator（需安裝 Java 11+）：
 *   npx firebase-tools emulators:exec --only firestore --project demo-jp-app "npx vitest run --config firebase/vitest.config.ts"
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const ALICE = 'alice'
const BOB = 'bob'

const validChunk = () => ({
  deviceId: 'dev-1',
  schemaVersion: 1,
  reviewLogs: [],
  cardEvents: [],
  handwritingLogs: [],
  quizLogs: [],
  contentReports: [],
  createdAt: serverTimestamp(),
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-jp-app',
    firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())
beforeEach(() => env.clearFirestore())

const dbAs = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()

describe('chunks', () => {
  it('本人可建立、讀取自己的 chunk', async () => {
    const db = dbAs(ALICE)
    await assertSucceeds(addDoc(collection(db, 'users', ALICE, 'chunks'), validChunk()))
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'chunks')))
  })

  it('未登入或其他人不能讀寫', async () => {
    await assertFails(addDoc(collection(dbAs(null), 'users', ALICE, 'chunks'), validChunk()))
    await assertFails(addDoc(collection(dbAs(BOB), 'users', ALICE, 'chunks'), validChunk()))
    await assertFails(getDocs(collection(dbAs(BOB), 'users', ALICE, 'chunks')))
  })

  it('createdAt 必須是伺服器時間，且需有 deviceId 與 schemaVersion', async () => {
    const db = dbAs(ALICE)
    const col = collection(db, 'users', ALICE, 'chunks')
    await assertFails(addDoc(col, { ...validChunk(), createdAt: new Date() }))
    await assertFails(addDoc(col, { ...validChunk(), deviceId: 123 }))
    await assertFails(addDoc(col, { ...validChunk(), schemaVersion: '1' }))
  })

  it('chunk 只增不改，但本人可刪除', async () => {
    const db = dbAs(ALICE)
    const ref = await addDoc(collection(db, 'users', ALICE, 'chunks'), validChunk())
    await assertFails(updateDoc(ref, { deviceId: 'dev-2' }))
    await assertFails(deleteDoc(doc(dbAs(BOB), 'users', ALICE, 'chunks', ref.id)))
    await assertSucceeds(deleteDoc(ref))
  })
})

describe('settings', () => {
  it('本人可讀寫設定；其他人不行', async () => {
    const ref = doc(dbAs(ALICE), 'users', ALICE, 'settings', 'main')
    await assertSucceeds(setDoc(ref, { dailyNewKana: { value: 5, updatedAt: 1 } }))
    await assertSucceeds(getDoc(ref))
    await assertFails(getDoc(doc(dbAs(BOB), 'users', ALICE, 'settings', 'main')))
    await assertFails(setDoc(doc(dbAs(BOB), 'users', ALICE, 'settings', 'main'), { x: 1 }))
  })
})
