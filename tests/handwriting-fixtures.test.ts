/**
 * 真實筆跡回歸測試（規劃書 Q10、docs/p0-verification.md §2.4）：
 * tests/fixtures/strokes/*.json 收錄 iPhone 實測筆跡與人工標記的正確判定。
 * 調整門檻或演算法後，正確的筆跡必須通過、錯誤筆跡的判定種類必須正確。
 */
import { describe, expect, it } from 'vitest'
import { matchStroke } from '@/core/handwriting/matcher'
import type { CharTemplate, Difficulty, Point, UserStroke, VerdictKind } from '@/core/handwriting/types'

interface FixtureCase {
  id: string
  expectedIndex: number
  remaining: number[]
  expect: VerdictKind
  matchedIndex?: number
  points: Point[]
}
interface Fixture {
  char: string
  pointerType: UserStroke['pointerType']
  difficulty: Difficulty
  cases: FixtureCase[]
}

const fixtures = import.meta.glob<Fixture>('./fixtures/strokes/*.json', { eager: true, import: 'default' })
const strokeFiles = import.meta.glob<CharTemplate>('../public/content/strokes/0*.json', { eager: true, import: 'default' })
const templates = new Map(Object.values(strokeFiles).map((t) => [t.char, t]))

for (const [file, fx] of Object.entries(fixtures)) {
  const template = templates.get(fx.char)
  if (!template) throw new Error(`找不到「${fx.char}」的筆畫資料`)

  describe(`${file}（${fx.char}，${fx.pointerType}）`, () => {
    for (const c of fx.cases) {
      it(`${c.id}：第 ${c.expectedIndex + 1} 筆 → ${c.expect}`, () => {
        const v = matchStroke(
          { points: c.points, pointerType: fx.pointerType, durationMs: 300 },
          template,
          c.expectedIndex,
          c.remaining,
          { difficulty: fx.difficulty },
        )
        expect(v.kind).toBe(c.expect)
        if (c.matchedIndex !== undefined) expect(v.matchedIndex).toBe(c.matchedIndex)
      })
    }
  })
}
