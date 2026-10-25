import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 以假的 speechSynthesis 驗證解鎖與 cancel 規則 */
class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  volume = 1
  voice: unknown = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

describe('tts', () => {
  let synth: { speaking: boolean; pending: boolean; speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: () => unknown[] }
  beforeEach(() => {
    vi.resetModules()
    synth = {
      speaking: false,
      pending: false,
      speak: vi.fn((u: FakeUtterance) => {
        u.onstart?.()
        u.onend?.()
      }),
      cancel: vi.fn(),
      getVoices: () => [],
    }
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('第一次點擊時靜音播放一次來解鎖，之後不再重複', async () => {
    const tts = await import('./index')
    tts.installTtsUnlock()
    expect(tts.isTtsUnlocked()).toBe(false)
    window.dispatchEvent(new Event('click'))
    expect(tts.isTtsUnlocked()).toBe(true)
    expect(synth.speak).toHaveBeenCalledTimes(1)
    expect((synth.speak.mock.calls[0]![0] as FakeUtterance).volume).toBe(0)
    window.dispatchEvent(new Event('touchend'))
    expect(synth.speak).toHaveBeenCalledTimes(1)
  })

  it('沒有在播放時不呼叫 cancel（避免 iOS 丟掉緊接著的 speak）', async () => {
    const tts = await import('./index')
    const onStart = vi.fn()
    await tts.speakJa('みず', { onStart })
    expect(synth.cancel).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalled()
    synth.speaking = true
    await tts.speakJa('あ')
    expect(synth.cancel).toHaveBeenCalledTimes(1)
  })
})
