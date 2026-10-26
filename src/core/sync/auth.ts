import type { User } from 'firebase/auth'
import { getFirebase } from './firebaseApp'
import { errorMessage } from '@/core/util/errors'

/**
 * 登入（規劃書 §7.2）：只提供電子郵件 + 密碼。
 * Google 登入於 P0 實測不可靠（iOS 主畫面 App 的彈出視窗在切換到 Gmail 做兩步驟驗證後會被重置），已移除。
 */

export interface AuthUser {
  uid: string
  email: string | null
  provider: string
}

function toAuthUser(u: User): AuthUser {
  return { uid: u.uid, email: u.email, provider: u.providerData[0]?.providerId ?? 'password' }
}

/** Firebase Auth 錯誤碼轉成使用者看得懂的訊息 */
export function describeAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-email': '電子郵件格式不正確',
    'auth/missing-password': '請輸入密碼',
    'auth/weak-password': '密碼至少 6 個字元',
    'auth/email-already-in-use': '這個電子郵件已經註冊過，請直接登入',
    'auth/invalid-credential': '電子郵件或密碼錯誤',
    'auth/wrong-password': '密碼錯誤',
    'auth/user-not-found': '找不到這個帳號',
    'auth/too-many-requests': '嘗試次數過多，請稍後再試',
    'auth/network-request-failed': '網路連線失敗',
    'auth/operation-not-allowed': 'Firebase 尚未啟用這種登入方式',
    'auth/requires-recent-login': '為了安全，請重新輸入密碼後再執行',
  }
  return map[code] ?? (errorMessage(e))
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthUser> {
  const { auth } = await getFirebase()
  const { createUserWithEmailAndPassword } = await import('firebase/auth')
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  return toAuthUser(cred.user)
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const { auth } = await getFirebase()
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return toAuthUser(cred.user)
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = await getFirebase()
  const { sendPasswordResetEmail } = await import('firebase/auth')
  await sendPasswordResetEmail(auth, email)
}

export async function signOut(): Promise<void> {
  const { auth } = await getFirebase()
  await auth.signOut()
}

/** 監聽登入狀態；回傳取消監聽的函式。第一次回呼代表已從本機還原完登入狀態 */
export async function onAuthChanged(cb: (user: AuthUser | null) => void): Promise<() => void> {
  const { auth } = await getFirebase()
  const { onAuthStateChanged } = await import('firebase/auth')
  return onAuthStateChanged(auth, (u) => cb(u ? toAuthUser(u) : null))
}

/** 以密碼重新驗證（刪除帳號前 Firebase 要求最近登入過） */
export async function reauthenticate(password: string): Promise<void> {
  const { auth } = await getFirebase()
  const { EmailAuthProvider, reauthenticateWithCredential } = await import('firebase/auth')
  const user = auth.currentUser
  if (!user?.email) throw new Error('尚未登入')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
}

/** 刪除帳號（Firebase 要求最近登入過；請先 reauthenticate） */
export async function deleteAccount(): Promise<void> {
  const { auth } = await getFirebase()
  const { deleteUser } = await import('firebase/auth')
  if (!auth.currentUser) throw new Error('尚未登入')
  await deleteUser(auth.currentUser)
}
