/**
 * 發音（規劃書 §6.3）：iOS speechSynthesis 的 ja-JP 語音。
 * - iOS 規定第一次發音必須發生在使用者點擊當下；之後才允許程式自動播放。
 *   因此 App 在第一次點擊任何地方時，靜音播放一段空白來「解鎖」（installTtsUnlock）。
 * - 單字送假名讀音而非漢字，避免誤讀
 */

export interface JaVoice {
  name: string
  lang: string
  localService: boolean
  default: boolean
}

export function isTtsSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

let unlocked = false

export function isTtsUnlocked(): boolean {
  return unlocked
}

/**
 * 在第一次使用者點擊時解鎖語音。iOS 的觸控只有在 touchend／click 才算使用者手勢
 *（pointerdown 不算），所以監聽這兩個事件。
 */
export function installTtsUnlock(): void {
  if (!isTtsSupported() || unlocked) return
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    u.lang = 'ja-JP'
    speechSynthesis.speak(u)
    window.removeEventListener('touchend', unlock, true)
    window.removeEventListener('click', unlock, true)
  }
  window.addEventListener('touchend', unlock, true)
  window.addEventListener('click', unlock, true)
}

/** 取得日文語音清單；iOS 的 voices 可能要等 voiceschanged 之後才有 */
export function loadJaVoices(timeoutMs = 1500): Promise<JaVoice[]> {
  if (!isTtsSupported()) return Promise.resolve([])
  const pick = () =>
    speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith('ja'))
      .map((v) => ({ name: v.name, lang: v.lang, localService: v.localService, default: v.default }))
  const now = pick()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done)
      resolve(pick())
    }
    speechSynthesis.addEventListener('voiceschanged', done)
    setTimeout(done, timeoutMs)
  })
}

export interface SpeakOptions {
  voiceName?: string
  rate?: number
  /** 開始播放時呼叫（可用來判斷是否被 iOS 擋下） */
  onStart?: () => void
}

/** 播放中的 utterance：保留參考，避免 Safari 在播完前回收物件而收不到 onend */
const active = new Set<SpeechSynthesisUtterance>()

/** 朗讀；回傳 Promise 於播放結束或失敗時結束 */
export function speakJa(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!isTtsSupported()) return Promise.reject(new Error('此裝置不支援語音合成'))
  return new Promise((resolve, reject) => {
    // iOS：cancel() 之後立刻 speak() 常會被丟掉，只在真的有東西在播時才取消
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = options.rate ?? 0.9
    if (options.voiceName) {
      const v = speechSynthesis.getVoices().find((x) => x.name === options.voiceName)
      if (v) u.voice = v
    }
    active.add(u)
    u.onstart = () => options.onStart?.()
    u.onend = () => {
      active.delete(u)
      resolve()
    }
    u.onerror = (e) => {
      active.delete(u)
      reject(new Error(`語音播放失敗：${e.error}`))
    }
    speechSynthesis.speak(u)
  })
}
