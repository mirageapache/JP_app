import type { Point, Polyline } from './types'

export function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function polylineLength(pts: Polyline): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!)
  return total
}

/** 弧長等距重取樣成 n 點（含首尾）；與 tools/kanjivg/build_strokes.py 的 resample 一致 */
export function resample(pts: Polyline, n: number): Point[] {
  if (pts.length === 0) return []
  const first = pts[0]!
  if (pts.length === 1) return Array.from({ length: n }, () => first)
  const total = polylineLength(pts)
  if (total === 0) return Array.from({ length: n }, () => first)
  const step = total / (n - 1)
  const out: Point[] = [first]
  let acc = 0
  let prev = first
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!
    const seg = dist(prev, p)
    while (seg > 0 && acc + seg >= step * out.length - 1e-9 && out.length < n - 1) {
      const t = (step * out.length - acc) / seg
      out.push([prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t])
    }
    acc += seg
    prev = p
  }
  const last = pts[pts.length - 1]!
  while (out.length < n) out.push(last)
  return out
}

/** 依順序逐點平均距離（兩條折線點數需相同） */
export function averagePointDistance(a: Polyline, b: Polyline): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return Infinity
  let sum = 0
  for (let i = 0; i < n; i++) sum += dist(a[i]!, b[i]!)
  return sum / n
}

/** 離散 Fréchet 距離（形狀相似度，對取樣點數不敏感） */
export function frechetDistance(a: Polyline, b: Polyline): number {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return Infinity
  const ca = new Float64Array(n * m).fill(-1)
  const at = (i: number, j: number) => ca[i * m + j]!
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = dist(a[i]!, b[j]!)
      let v: number
      if (i === 0 && j === 0) v = d
      else if (i === 0) v = Math.max(at(0, j - 1), d)
      else if (j === 0) v = Math.max(at(i - 1, 0), d)
      else v = Math.max(Math.min(at(i - 1, j), at(i - 1, j - 1), at(i, j - 1)), d)
      ca[i * m + j] = v
    }
  }
  return at(n - 1, m - 1)
}

/** 分段方向的平均餘弦相似度：兩條折線各切成 segments 段，比較每段的方向向量 */
export function directionSimilarity(a: Polyline, b: Polyline, segments = 4): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 1
  const per = Math.max(1, Math.floor((n - 1) / segments))
  let sum = 0
  let count = 0
  for (let s = 0; s + per < n; s += per) {
    const va: Point = [a[s + per]![0] - a[s]![0], a[s + per]![1] - a[s]![1]]
    const vb: Point = [b[s + per]![0] - b[s]![0], b[s + per]![1] - b[s]![1]]
    const la = Math.hypot(va[0], va[1])
    const lb = Math.hypot(vb[0], vb[1])
    if (la < 1e-6 || lb < 1e-6) continue
    sum += (va[0] * vb[0] + va[1] * vb[1]) / (la * lb)
    count++
  }
  return count === 0 ? 1 : sum / count
}

export function centroid(pts: Polyline): Point {
  if (pts.length === 0) return [0, 0]
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p[0]
    y += p[1]
  }
  return [x / pts.length, y / pts.length]
}

export function translate(pts: Polyline, dx: number, dy: number): Point[] {
  return pts.map((p) => [p[0] + dx, p[1] + dy] as Point)
}

export function reverse(pts: Polyline): Point[] {
  return [...pts].reverse()
}

/** 平移到重心、以 RMS 半徑縮放成單位大小：之後比較只剩「形狀」，不受位置與大小影響 */
export function normalizeShape(pts: Polyline): Point[] {
  const c = centroid(pts)
  let sum = 0
  for (const p of pts) sum += (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2
  const rms = Math.sqrt(sum / Math.max(1, pts.length)) || 1
  return pts.map((p) => [(p[0] - c[0]) / rms, (p[1] - c[1]) / rms] as Point)
}

/** 正規化 Fréchet：兩條折線的純形狀差異（無單位，0 = 完全相同） */
export function shapeDistance(a: Polyline, b: Polyline): number {
  return frechetDistance(normalizeShape(a), normalizeShape(b))
}

/**
 * 去除與最近幾個點完全相同的點。iOS 第一次 pointermove 的 getCoalescedEvents() 會重送已處理的點，
 * 造成起點 a, b, c, b, c… 的折返（P0 驗證 §2.3）。
 */
export function dropRepeatedPoints(pts: Polyline, lookback = 8): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const recent = out.slice(-lookback)
    if (recent.some((q) => q[0] === p[0] && q[1] === p[1])) continue
    out.push(p)
  }
  return out
}
