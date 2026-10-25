import { describe, expect, it } from 'vitest'
import type { HandwritingLog } from '@/core/db'
import { weaknessScores } from './weakness'

function log(cardId: string, misses: number, at: number, extra: Partial<HandwritingLog> = {}): HandwritingLog {
  return {
    uuid: `${cardId}-${at}`,
    cardId,
    variantId: 'kanjivg',
    difficulty: 'blank',
    pointerType: 'touch',
    score: 100,
    strokeResults: [{ strokeIndex: 0, kind: 'pass', difficulty: 'blank' }, { strokeIndex: 1, kind: 'pass', difficulty: 'blank' }],
    misses,
    hintsUsed: 0,
    skipped: false,
    durationMs: 3000,
    mode: 'free',
    at,
    syncedAt: null,
    ...extra,
  }
}

describe('弱點分數', () => {
  it('錯得多的分數高；只有一次練習的不列入；依分數排序', () => {
    const logs = [
      log('kana:ぬ#write', 2, 1), log('kana:ぬ#write', 1, 2),
      log('kana:あ#write', 0, 1), log('kana:あ#write', 0, 2),
      log('kana:そ#write', 0, 1), // 只有一次
    ]
    const s = weaknessScores(logs)
    expect(s.map((x) => x.char)).toEqual(['ぬ', 'あ'])
    expect(s[0]!.score).toBeGreaterThan(30)
    expect(s[1]!.score).toBe(0)
  })

  it('跳過視為最弱；看過提示至少 70；越近的練習權重越大', () => {
    const skipped = weaknessScores([log('kana:き#write', 0, 1, { skipped: true }), log('kana:き#write', 0, 2, { skipped: true })])
    expect(skipped[0]!.score).toBe(100)
    const hinted = weaknessScores([log('kana:さ#write', 0, 1, { hintsUsed: 1 }), log('kana:さ#write', 0, 2, { hintsUsed: 1 })])
    expect(hinted[0]!.score).toBe(70)
    const improving = weaknessScores([log('kana:ふ#write', 2, 1), log('kana:ふ#write', 0, 2)])
    const worsening = weaknessScores([log('kana:ふ#write', 0, 1), log('kana:ふ#write', 2, 2)])
    expect(improving[0]!.score).toBeLessThan(worsening[0]!.score)
  })
})
