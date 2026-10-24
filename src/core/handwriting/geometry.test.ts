import { describe, expect, it } from 'vitest'
import { averagePointDistance, directionSimilarity, frechetDistance, polylineLength, resample } from './geometry'
import type { Point } from './types'

describe('geometry', () => {
  it('resample 產生等距的 n 點並保留首尾', () => {
    const out = resample(
      [
        [0, 0],
        [100, 0],
      ],
      5,
    )
    expect(out).toEqual([
      [0, 0],
      [25, 0],
      [50, 0],
      [75, 0],
      [100, 0],
    ])
    const curve: Point[] = Array.from({ length: 50 }, (_, i) => [i * 2, Math.sin(i / 5) * 20])
    const r = resample(curve, 32)
    expect(r).toHaveLength(32)
    expect(r[0]).toEqual(curve[0])
    expect(r[31]).toEqual(curve[49])
    const segs = r.slice(1).map((p, i) => Math.hypot(p[0] - r[i]![0], p[1] - r[i]![1]))
    expect(Math.max(...segs) - Math.min(...segs)).toBeLessThan(0.5)
    const len = polylineLength(curve)
    expect(Math.abs(segs.reduce((a, b) => a + b, 0) - len) / len).toBeLessThan(0.02)
  })

  it('resample 處理退化輸入', () => {
    expect(resample([], 4)).toEqual([])
    expect(resample([[3, 3]], 3)).toEqual([
      [3, 3],
      [3, 3],
      [3, 3],
    ])
  })

  it('frechet：相同折線為 0，平移後等於位移量', () => {
    const a: Point[] = [
      [0, 0],
      [10, 0],
      [20, 5],
    ]
    expect(frechetDistance(a, a)).toBe(0)
    const b = a.map((p) => [p[0], p[1] + 7] as Point)
    expect(frechetDistance(a, b)).toBeCloseTo(7)
  })

  it('反向折線的逐點距離明顯較大、方向相似度為負', () => {
    const a: Point[] = Array.from({ length: 32 }, (_, i) => [i * 3, 0])
    const rev = [...a].reverse()
    expect(averagePointDistance(a, a)).toBe(0)
    expect(averagePointDistance(a, rev)).toBeGreaterThan(40)
    expect(directionSimilarity(a, a)).toBeCloseTo(1)
    expect(directionSimilarity(a, rev)).toBeCloseTo(-1)
  })
})
