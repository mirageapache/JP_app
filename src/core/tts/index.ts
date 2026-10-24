/**
 * 發音（規劃書 §6.3）：iOS speechSynthesis 的 ja-JP 語音。
 * - 首次播放須由使用者點擊觸發
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
}

/** 朗讀；回傳 Promise 於播放結束或失敗時結束 */
export function speakJa(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!isTtsSupported()) return Promise.reject(new Error('此裝置不支援語音合成'))
  return new Promise((resolve, reject) => {
    // iOS 若前一段還在播放，新的 speak 可能沒聲音；先取消
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = options.rate ?? 0.9
    if (options.voiceName) {
      const v = speechSynthesis.getVoices().find((x) => x.name === options.voiceName)
      if (v) u.voice = v
    }
    u.onend = () => resolve()
    u.onerror = (e) => reject(new Error(`語音播放失敗：${e.error}`))
    speechSynthesis.speak(u)
  })
}
