import { describe, expect, it, vi } from 'vitest'
import { useTapToReveal } from './useTapToReveal'

describe('useTapToReveal', () => {
  it('連點達到次數才觸發，超過間隔重數', () => {
    vi.useFakeTimers()
    const onReveal = vi.fn()
    const { tap } = useTapToReveal(3, onReveal, 1000)
    tap()
    tap()
    vi.advanceTimersByTime(1500)
    tap() // 間隔過長，重新從 1 開始
    tap()
    expect(onReveal).not.toHaveBeenCalled()
    tap()
    expect(onReveal).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
