import {
  averagePointDistance,
  centroid,
  dist,
  directionSimilarity,
  dropRepeatedPoints,
  frechetDistance,
  polylineLength,
  resample,
  reverse,
  shapeDistance,
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
 * 逐筆比對（規劃書 §6.1，做法參考 Hanzi Writer）。形狀與位置分開判斷：
 * - 形狀：正規化 Fréchet（平移到重心、縮放到單位大小後比較），寫大寫小不影響
 * - 位置：依順序逐點平均距離、起點與終點距離
 * - 大小：長度比例；方向：正向 vs 反向逐點距離 + 分段方向
 * 不符合預期筆畫時，再判斷連筆、順序錯誤、位置偏差。
 *
 * 門檻依 P0 第一輪實測校準（docs/p0-verification.md §2，tests/fixtures/strokes/）。
 */

/** 基準門檻：距離為 109 座標單位，shape 無單位；再依難度與輸入方式乘上係數 */
export const BASE_THRESHOLDS: Thresholds = {
  avgDistance: 20,
  shape: 0.8,
  startDistance: 22,
  endDistance: 26,
  lengthRatioMin: 0.5,
  lengthRatioMax: 2,
  directionMin: 0.5,
  dotLength: 13,
}

export const DIFFICULTY_FACTOR: Record<Difficulty, number> = { trace: 1.3, hint: 1.15, blank: 1 }

/** 手指比 Apple Pencil 不精準，門檻放寬（規劃書 §6.1） */
export const POINTER_FACTOR: Record<UserStroke['pointerType'], number> = { pen: 1, touch: 1.3, mouse: 1.15 }

export function scaleThresholds(base: Thresholds, factor: number): Thresholds {
  return {
    ...base,
    avgDistance: base.avgDistance * factor,
    shape: base.shape * factor,
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
  return {
    avgDistance: averagePointDistance(u, t),
    avgDistanceReversed: averagePointDistance(reverse(u), t),
    frechet: frechetDistance(u, t),
    shape: shapeDistance(u, t),
    startDistance: dist(u[0]!, t[0]!),
    endDistance: dist(u[n - 1]!, t[n - 1]!),
    lengthRatio: template.length > 0 ? polylineLength(user) / template.length : 0,
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

function shapeOk(m: StrokeMetrics, th: Thresholds): boolean {
  return m.shape <= th.shape && m.directionSimilarity >= th.directionMin
}

function sizeOk(m: StrokeMetrics, th: Thresholds): boolean {
  return m.lengthRatio >= th.lengthRatioMin && m.lengthRatio <= th.lengthRatioMax
}

function positionOk(m: StrokeMetrics, th: Thresholds): boolean {
  return m.avgDistance <= th.avgDistance && m.startDistance <= th.startDistance && m.endDistance <= th.endDistance
}

function passes(m: StrokeMetrics, th: Thresholds): boolean {
  return shapeOk(m, th) && sizeOk(m, th) && positionOk(m, th)
}

function strokePasses(user: Polyline, template: StrokeTemplate, th: Thresholds, metrics?: StrokeMetrics): boolean {
  if (isDot(template, th)) return dotPasses(user, template, th)
  return passes(metrics ?? computeMetrics(user, template), th)
}

/**
 * 連筆：使用者這一筆的形狀符合「預期筆 + 下一筆」接起來的折線，起點在預期筆起點、終點在下一筆終點，
 * 長度接近兩筆相加。只檢查緊接的下一筆；更多筆連寫的情況會落到 shape。
 * 實際連筆會直接從本筆尾端拐進下一筆（不經過下一筆起點），長度較短、形狀與直接接起來的折線有落差，
 * 因此形狀門檻放寬 CONNECTED_SHAPE_SLACK 倍（P0 實測 E4：形狀 1.18、長度比 0.72）。
 * 長度比用固定範圍（不隨係數放寬）；「只寫了下一筆」會先被順序錯誤判定攔下。
 */
const CONNECTED_LENGTH_RANGE = [0.6, 1.5] as const
const CONNECTED_SHAPE_SLACK = 1.5

function isConnected(user: Polyline, a: StrokeTemplate, b: StrokeTemplate, th: Thresholds): boolean {
  const joined = resample([...a.points, ...b.points], a.points.length * 2)
  const u = resample(user, joined.length)
  const ratio = polylineLength(user) / polylineLength(joined)
  return (
    ratio >= CONNECTED_LENGTH_RANGE[0] &&
    ratio <= CONNECTED_LENGTH_RANGE[1] &&
    dist(u[0]!, joined[0]!) <= th.startDistance &&
    dist(u[u.length - 1]!, joined[joined.length - 1]!) <= th.endDistance &&
    shapeDistance(u, joined) <= th.shape * CONNECTED_SHAPE_SLACK
  )
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
  const cleaned = dropRepeatedPoints(stroke.points)
  const user = cleaned.length >= 2 ? cleaned : [cleaned[0] ?? [0, 0], cleaned[0] ?? [0, 0]]
  const metrics = computeMetrics(user, expected)
  const verdict = (kind: Verdict['kind'], matchedIndex?: number): Verdict => ({ kind, matchedIndex, metrics, thresholds: th })

  // 點與點之間（が 的兩個濁點）靠重心距離判順序：明顯更靠近另一個未寫的點就是順序錯誤
  if (isDot(expected, th)) {
    const dExpected = dotDistance(user, expected)
    for (const idx of remaining) {
      const other = template.strokes[idx]
      if (idx === expectedIndex || !other || !isDot(other, th)) continue
      if (dotDistance(user, other) < dExpected * 0.6 && dotPasses(user, other, th)) return verdict('order', idx)
    }
  }

  if (strokePasses(user, expected, th, metrics)) return verdict('pass')
  if (isDot(expected, th)) return verdict('position')

  // 反向書寫：反過來比就通過，且明顯比正向好
  const reversedMetrics = computeMetrics(reverse(user), expected)
  if (passes(reversedMetrics, th) && metrics.avgDistance > reversedMetrics.avgDistance * 1.5) return verdict('direction')

  // 順序錯誤：完全符合另一筆尚未寫的筆畫（門檻與預期筆相同，不另外放寬），且形狀比預期筆更像
  for (const idx of remaining) {
    if (idx === expectedIndex) continue
    const other = template.strokes[idx]
    if (!other) continue
    if (isDot(other, th)) {
      if (dotPasses(user, other, th)) return verdict('order', idx)
      continue
    }
    const om = computeMetrics(user, other)
    if (passes(om, th) && om.shape < metrics.shape) return verdict('order', idx)
  }

  // 連筆：形狀符合「這一筆 + 下一筆」接起來（排在順序錯誤之後，避免搶走「先寫了下一筆」）
  const next = template.strokes[expectedIndex + 1]
  if (next && !isDot(next, th) && remaining.includes(expectedIndex + 1) && isConnected(user, expected, next, th)) {
    return verdict('connected')
  }

  // 形狀與大小都對、只是位置偏了
  if (shapeOk(metrics, th) && sizeOk(metrics, th)) return verdict('position')

  return verdict('shape')
}
