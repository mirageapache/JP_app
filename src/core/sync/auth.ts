import type { User } from 'firebase/auth'
import { getFirebase } from './firebaseApp'

/** 登入（規劃書 §7.2）：預設電子郵件 + 密碼；Google 登入為選項，P0 驗證可行後才開放 */

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
    'auth/popup-blocked': '彈出視窗被封鎖',
    'auth/popup-closed-by-user': '登入視窗已關閉',
    'auth/unauthorized-domain': '此網域未列入 Firebase 授權網域',
    'auth/operation-not-allowed': 'Firebase 尚未啟用這種登入方式',
  }
  return map[code] ?? (e instanceof Error ? e.message : String(e))
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

/**
 * Google 登入：先試彈出視窗；iOS 主畫面 App 若不支援彈出視窗則改用重新導向
 *（重新導向在第三方儲存受限的瀏覽器可能失敗，P0 實測）
 */
export async function signInWithGoogle(): Promise<AuthUser | 'redirecting'> {
  const { auth } = await getFirebase()
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth')
  const provider = new GoogleAuthProvider()
  try {
    const cred = await signInWithPopup(auth, provider)
    return toAuthUser(cred.user)
  } catch (e) {
    const code = (e as { code?: string })?.code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
      return 'redirecting'
    }
    throw e
  }
}

/** 重新導向登入回來後取得結果；沒有待處理的結果時回傳 null */
export async function consumeRedirectResult(): Promise<AuthUser | null> {
  const { auth } = await getFirebase()
  const { getRedirectResult } = await import('firebase/auth')
  const cred = await getRedirectResult(auth)
  return cred ? toAuthUser(cred.user) : null
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

/** 刪除帳號（Firebase 要求最近登入過；逾時需重新登入） */
export async function deleteAccount(): Promise<void> {
  const { auth } = await getFirebase()
  const { deleteUser } = await import('firebase/auth')
  if (!auth.currentUser) throw new Error('尚未登入')
  await deleteUser(auth.currentUser)
}
