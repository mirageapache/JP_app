import { describe, expect, it } from 'vitest'
import { translate } from './geometry'
import { computeMetrics, matchStroke, thresholdsFor } from './matcher'
import { applyStroke, createSession, skip, summarize } from './session'
import type { CharTemplate, Point, UserStroke } from './types'
import a from '../../../public/content/strokes/03042.json' // あ（3 筆）
import ga from '../../../public/content/strokes/0304c.json' // が（5 筆，含濁點）

const あ = a as unknown as CharTemplate
const が = ga as unknown as CharTemplate

/** 以標準筆畫加上小幅抖動模擬「寫對」 */
function jitter(points: readonly Point[], amount = 1.5, seed = 1): Point[] {
  let s = seed
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 2 * amount
  return points.map((p) => [p[0] + rnd(), p[1] + rnd()])
}

function stroke(points: readonly Point[], pointerType: UserStroke['pointerType'] = 'pen'): UserStroke {
  return { points, pointerType, durationMs: 400 }
}

const opts = { difficulty: 'blank' as const }
const allOf = (t: CharTemplate) => t.strokes.map((_, i) => i)

describe('matchStroke', () => {
  it('接近標準筆畫 → 通過', () => {
    for (let i = 0; i < あ.strokes.length; i++) {
      const v = matchStroke(stroke(jitter(あ.strokes[i]!.points)), あ, i, allOf(あ).slice(i), opts)
      expect(v.kind, `第 ${i + 1} 筆`).toBe('pass')
    }
  })

  it('反向書寫 → direction', () => {
    const rev = [...あ.strokes[0]!.points].reverse()
    const v = matchStroke(stroke(rev), あ, 0, allOf(あ), opts)
    expect(v.kind).toBe('direction')
  })

  it('先寫第 2 筆 → order，並指出實際寫的是哪一筆', () => {
    const v = matchStroke(stroke(jitter(あ.strokes[1]!.points)), あ, 0, allOf(あ), opts)
    expect(v.kind).toBe('order')
    expect(v.matchedIndex).toBe(1)
  })

  it('形狀對但整體偏移 → position', () => {
    const moved = translate(あ.strokes[0]!.points, 0, 30)
    const v = matchStroke(stroke(moved), あ, 0, allOf(あ), opts)
    expect(v.kind).toBe('position')
  })

  it('亂畫 → shape', () => {
    const scribble: Point[] = Array.from({ length: 40 }, (_, i) => [20 + (i % 2) * 60, 20 + i * 1.5])
    const v = matchStroke(stroke(scribble), あ, 2, [2], opts)
    expect(v.kind).toBe('shape')
  })

  it('濁點：落在附近的小點即通過，不檢查方向', () => {
    const dot = が.strokes[3]!
    const c = dot.points[Math.floor(dot.points.length / 2)]!
    const tiny: Point[] = [
      [c[0] - 2, c[1] + 1],
      [c[0] + 2, c[1] - 1],
    ]
    const v = matchStroke(stroke(tiny), が, 3, [3, 4], opts)
    expect(v.kind).toBe('pass')
    const far = translate(tiny, 40, 40)
    expect(matchStroke(stroke(far), が, 3, [3, 4], opts).kind).not.toBe('pass')
  })

  it('濁點先寫第二點 → order', () => {
    const second = が.strokes[4]!
    const c = second.points[Math.floor(second.points.length / 2)]!
    const tiny: Point[] = [
      [c[0] - 2, c[1] + 1],
      [c[0] + 2, c[1] - 1],
    ]
    const v = matchStroke(stroke(tiny), が, 3, [3, 4], opts)
    expect(v.kind).toBe('order')
    expect(v.matchedIndex).toBe(4)
  })

  it('稍微偏移、放大的第 2 筆仍判為順序錯誤', () => {
    const pts = あ.strokes[1]!.points
    const c = pts[Math.floor(pts.length / 2)]!
    const sloppy = translate(pts.map((p) => [c[0] + (p[0] - c[0]) * 1.15, c[1] + (p[1] - c[1]) * 1.15] as Point), 6, 4)
    const v = matchStroke(stroke(sloppy), あ, 0, allOf(あ), opts)
    expect(v.kind).toBe('order')
    expect(v.matchedIndex).toBe(1)
  })

  it('手指與描摹模式的門檻比 Pencil／空白寬鬆', () => {
    const base = thresholdsFor('blank', 'pen')
    expect(thresholdsFor('blank', 'touch').avgDistance).toBeGreaterThan(base.avgDistance)
    expect(thresholdsFor('trace', 'pen').shape).toBeGreaterThan(base.shape)
    expect(thresholdsFor('trace', 'touch').lengthRatioMin).toBeLessThan(base.lengthRatioMin)
  })

  it('metrics 對完全相同的筆畫為 0', () => {
    const m = computeMetrics(あ.strokes[0]!.points, あ.strokes[0]!)
    expect(m.avgDistance).toBeCloseTo(0, 1)
    expect(m.frechet).toBeCloseTo(0, 1)
    expect(m.shape).toBeCloseTo(0, 1)
    expect(m.lengthRatio).toBeCloseTo(1, 1)
  })
})

describe('session', () => {
  it('全部一次通過 → 良好（慢）或簡單（快）', () => {
    const s = createSession()
    let t = 1000
    for (let i = 0; i < あ.strokes.length; i++) {
      expect(applyStroke(s, あ, stroke(jitter(あ.strokes[i]!.points)), opts, (t += 500)).kind).toBe('pass')
    }
    // 3 筆各 500ms → 總時間 1000ms
    expect(summarize(s, あ, 800).rating).toBe('good')
    expect(summarize(s, あ, 5000).rating).toBe('easy')
  })

  it('錯一次再寫對 → 困難；連錯 3 次顯示提示 → 重來', () => {
    const s = createSession()
    const wrong = stroke([...あ.strokes[0]!.points].reverse())
    expect(applyStroke(s, あ, wrong, opts).kind).toBe('direction')
    expect(s.expectedIndex).toBe(0)
    applyStroke(s, あ, stroke(jitter(あ.strokes[0]!.points)), opts)
    expect(s.expectedIndex).toBe(1)
    expect(summarize(s, あ, 0).misses).toBe(1)

    const s2 = createSession()
    applyStroke(s2, あ, wrong, opts)
    applyStroke(s2, あ, wrong, opts)
    expect(s2.hintShown).toBe(false)
    applyStroke(s2, あ, wrong, opts)
    expect(s2.hintShown).toBe(true)
    expect(s2.hintsUsed).toBe(1)
    for (let i = 0; i < あ.strokes.length; i++) applyStroke(s2, あ, stroke(jitter(あ.strokes[i]!.points)), opts)
    expect(summarize(s2, あ, 0).rating).toBe('again')
  })

  it('跳過 → 重來', () => {
    const s = createSession()
    skip(s)
    const sum = summarize(s, あ, 0)
    expect(sum.skipped).toBe(true)
    expect(sum.rating).toBe('again')
  })
})

describe('連筆與順序錯誤的區分（code review 回饋）', () => {
  const strokeFiles = import.meta.glob<CharTemplate>('../../../public/content/strokes/0*.json', {
    eager: true,
    import: 'default',
  })
  const byChar = new Map(Object.values(strokeFiles).map((t) => [t.char, t]))
  const get = (c: string) => byChar.get(c)!
  const touch = (pts: readonly Point[]) => stroke(jitter(pts, 1.5, 3), 'touch')

  // ム 的第 2 筆是很短的勾，連起來幾乎就是第 1 筆，判為通過是可接受的，故不列入
  it.each(['あ', 'い', 'け', 'ぬ', 'た', 'マ'])('%s：第 1、2 筆連成一筆 → connected', (c) => {
    const t = get(c)
    const joined = [...t.strokes[0]!.points, ...t.strokes[1]!.points]
    const v = matchStroke(touch(joined), t, 0, allOf(t), opts)
    expect(v.kind).toBe('connected')
  })

  it.each([
    ['け', 1, 2],
    ['ぱ', 1, 2],
    ['あ', 0, 1],
    ['た', 1, 2],
  ] as const)('%s：該寫第 %i 筆卻寫了第 %i 筆 → order', (c, expected, actual) => {
    const t = get(c)
    const v = matchStroke(touch(t.strokes[actual]!.points), t, expected, allOf(t).slice(expected), opts)
    expect(v.kind).toBe('order')
    expect(v.matchedIndex).toBe(actual)
  })
})
