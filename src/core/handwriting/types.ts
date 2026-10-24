/** 座標一律使用 KanjiVG 的 109×109 座標系（規劃書 §6.1） */
export type Point = readonly [number, number]
export type Polyline = readonly Point[]

export const VIEWBOX = 109

/** public/content/strokes/<code>.json 中的一筆 */
export interface StrokeTemplate {
  /** 原始 SVG path，供筆順動畫與描摹用 */
  d: string
  length: number
  /** 弧長等距取樣的點（通常 32 個） */
  points: Polyline
}

export interface CharTemplate {
  char: string
  code: string
  viewBox: number
  pointsPerStroke: number
  strokes: StrokeTemplate[]
}

export interface StrokeIndex {
  viewBox: number
  pointsPerStroke: number
  chars: Record<string, { code: string; strokeCount: number }>
}

/** 使用者寫的一筆（已轉成 109 座標） */
export interface UserStroke {
  points: Polyline
  pointerType: 'pen' | 'touch' | 'mouse'
  /** 從落筆到抬筆的毫秒數 */
  durationMs: number
}

export type Difficulty = 'trace' | 'hint' | 'blank'

export type VerdictKind = 'pass' | 'position' | 'direction' | 'order' | 'shape'

export interface StrokeMetrics {
  /** 依順序逐點平均距離 */
  avgDistance: number
  /** 反向逐點平均距離（判斷反向書寫） */
  avgDistanceReversed: number
  frechet: number
  startDistance: number
  endDistance: number
  /** 使用者筆畫長度 ÷ 標準筆畫長度 */
  lengthRatio: number
  /** 分段方向的平均餘弦相似度（-1～1） */
  directionSimilarity: number
}

export interface Verdict {
  kind: VerdictKind
  /** 若為 order：使用者實際寫的是第幾筆（0-based） */
  matchedIndex?: number
  metrics: StrokeMetrics
  /** 判定時使用的門檻（已乘上難度與輸入方式的係數） */
  thresholds: Thresholds
}

export interface Thresholds {
  avgDistance: number
  frechet: number
  startDistance: number
  endDistance: number
  lengthRatioMin: number
  lengthRatioMax: number
  /** 分段方向平均餘弦相似度的下限（不隨難度係數縮放） */
  directionMin: number
  /** 低於這個長度的筆畫視為「點」（濁點約 11.6；ふ 的點約 28 不算），只比位置與長度 */
  dotLength: number
}
