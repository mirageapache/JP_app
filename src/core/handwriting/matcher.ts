import {
  averagePointDistance,
  centroid,
  dist,
  directionSimilarity,
  frechetDistance,
  polylineLength,
  resample,
  reverse,
  translate,
} from './geometry'
import type {
  CharTemplate,
  Difficulty,
  Polyline,
  StrokeMetrics,
  StrokeTemplate,
  Thresholds,
  UserStroke,
  Verdict,
} from './types'

/**
 * 逐筆比對（規劃書 §6.1，做法參考 Hanzi Writer）：
 * 位置／形狀（逐點平均距離 + Fréchet）、方向（正向 vs 反向逐點距離 + 分段方向）、
 * 起訖點、長度比例；不符合預期筆畫時再與其餘未寫的筆畫比對以判定「順序錯誤」。
 */

/** 基準門檻（109 座標單位），依難度與輸入方式乘上係數；數值待 P0／P1a 實測調整 */
export const BASE_THRESHOLDS: Thresholds = {
  avgDistance: 14,
  frechet: 20,
  startDistance: 22,
  endDistance: 22,
  lengthRatioMin: 0.55,
  lengthRatioMax: 1.7,
  directionMin: 0.5,
  dotLength: 13,
}

export const DIFFICULTY_FACTOR: Record<Difficulty, number> = { trace: 1.3, hint: 1.15, blank: 1 }

/** 手指比 Apple Pencil 不精準，門檻放寬（design-system / 規劃書 §6.1） */
export const POINTER_FACTOR: Record<UserStroke['pointerType'], number> = { pen: 1, touch: 1.3, mouse: 1.15 }

export function scaleThresholds(base: Thresholds, factor: number): Thresholds {
  return {
    ...base,
    avgDistance: base.avgDistance * factor,
    frechet: base.frechet * factor,
    startDistance: base.startDistance * factor,
    endDistance: base.endDistance * factor,
    lengthRatioMin: base.lengthRatioMin / factor,
    lengthRatioMax: base.lengthRatioMax * factor,
  }
}

export function thresholdsFor(
  difficulty: Difficulty,
  pointerType: UserStroke['pointerType'],
  base: Thresholds = BASE_THRESHOLDS,
): Thresholds {
  return scaleThresholds(base, DIFFICULTY_FACTOR[difficulty] * POINTER_FACTOR[pointerType])
}

export function computeMetrics(user: Polyline, template: StrokeTemplate): StrokeMetrics {
  const n = template.points.length
  const u = resample(user, n)
  const t = template.points
  const userLength = polylineLength(user)
  return {
    avgDistance: averagePointDistance(u, t),
    avgDistanceReversed: averagePointDistance(reverse(u), t),
    frechet: frechetDistance(u, t),
    startDistance: dist(u[0]!, t[0]!),
    endDistance: dist(u[n - 1]!, t[n - 1]!),
    lengthRatio: template.length > 0 ? userLength / template.length : 0,
    directionSimilarity: directionSimilarity(u, t),
  }
}

function isDot(template: StrokeTemplate, th: Thresholds): boolean {
  return template.length < th.dotLength
}

function dotDistance(user: Polyline, template: StrokeTemplate): number {
  return dist(centroid(user), centroid(template.points))
}

/** 點（濁點等）只比位置與長度：使用者的點落在標準點附近即可 */
function dotPasses(user: Polyline, template: StrokeTemplate, th: Thresholds): boolean {
  const userLength = polylineLength(user)
  return dotDistance(user, template) <= th.startDistance && userLength <= template.length * th.lengthRatioMax + th.dotLength
}

function passes(m: StrokeMetrics, th: Thresholds): boolean {
  return (
    m.avgDistance <= th.avgDistance &&
    m.frechet <= th.frechet &&
    m.startDistance <= th.startDistance &&
    m.endDistance <= th.endDistance &&
    m.lengthRatio >= th.lengthRatioMin &&
    m.lengthRatio <= th.lengthRatioMax &&
    m.directionSimilarity >= th.directionMin
  )
}

function strokePasses(user: Polyline, template: StrokeTemplate, th: Thresholds, metrics?: StrokeMetrics): boolean {
  if (isDot(template, th)) return dotPasses(user, template, th)
  return passes(metrics ?? computeMetrics(user, template), th)
}

/** 順序錯誤用的寬鬆門檻：規格是「更接近其中某筆」，不要求另一筆完全通過 */
const ORDER_SLACK = 1.3

/** 形狀對、但整體平移了：把使用者筆畫移到標準筆畫的重心再比一次 */
function shapeMatchesAfterTranslation(user: Polyline, template: StrokeTemplate, th: Thresholds): boolean {
  const cu = centroid(user)
  const ct = centroid(template.points)
  const moved = translate(user, ct[0] - cu[0], ct[1] - cu[1])
  const m = computeMetrics(moved, template)
  return m.frechet <= th.frechet && m.lengthRatio >= th.lengthRatioMin && m.lengthRatio <= th.lengthRatioMax
}

export interface MatchOptions {
  difficulty: Difficulty
  /** 覆寫基準門檻（調校模式用） */
  baseThresholds?: Thresholds
}

/**
 * 比對使用者的一筆與「預期的第 expectedIndex 筆」。
 * remaining：尚未寫的筆畫索引（含 expectedIndex），用來判斷順序錯誤。
 */
export function matchStroke(
  stroke: UserStroke,
  template: CharTemplate,
  expectedIndex: number,
  remaining: readonly number[],
  options: MatchOptions,
): Verdict {
  const expected = template.strokes[expectedIndex]
  if (!expected) throw new Error(`沒有第 ${expectedIndex} 筆`)
  const th = thresholdsFor(options.difficulty, stroke.pointerType, options.baseThresholds)
  const user = stroke.points.length >= 2 ? stroke.points : [stroke.points[0] ?? [0, 0], stroke.points[0] ?? [0, 0]]
  const metrics = computeMetrics(user, expected)

  // 點與點之間（が 的兩個濁點）靠重心距離判順序：明顯更靠近另一個未寫的點就是順序錯誤
  if (isDot(expected, th)) {
    const dExpected = dotDistance(user, expected)
    for (const idx of remaining) {
      const other = template.strokes[idx]
      if (idx === expectedIndex || !other || !isDot(other, th)) continue
      if (dotDistance(user, other) < dExpected * 0.6 && dotPasses(user, other, th)) {
        return { kind: 'order', matchedIndex: idx, metrics, thresholds: th }
      }
    }
  }

  if (strokePasses(user, expected, th, metrics)) return { kind: 'pass', metrics, thresholds: th }

  // 反向書寫：反過來比就通過，且明顯比正向好
  if (!isDot(expected, th)) {
    const reversedMetrics = computeMetrics(reverse(user), expected)
    if (passes(reversedMetrics, th) && metrics.avgDistance > reversedMetrics.avgDistance * 1.5) {
      return { kind: 'direction', metrics, thresholds: th }
    }
  }

  // 順序錯誤：和其他尚未寫的筆畫比（門檻放寬），比預期那一筆更接近就是寫到別筆了
  const orderTh = scaleThresholds(th, ORDER_SLACK)
  for (const idx of remaining) {
    if (idx === expectedIndex) continue
    const other = template.strokes[idx]
    if (!other) continue
    if (isDot(other, th)) {
      if (dotPasses(user, other, th)) return { kind: 'order', matchedIndex: idx, metrics, thresholds: th }
      continue
    }
    const om = computeMetrics(user, other)
    if (passes(om, orderTh) && om.avgDistance < metrics.avgDistance) {
      return { kind: 'order', matchedIndex: idx, metrics, thresholds: th }
    }
  }

  // 形狀對但位置偏了
  if (!isDot(expected, th) && shapeMatchesAfterTranslation(user, expected, th)) {
    return { kind: 'position', metrics, thresholds: th }
  }

  return { kind: 'shape', metrics, thresholds: th }
}
