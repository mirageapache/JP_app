import type { Component } from 'vue'
import type { KanaItem } from '@/core/content/kana'
import type { CardType, Rating, Skill } from '@/core/srs/types'
import RecognizeCard from './RecognizeCard.vue'
import WriteCard from './WriteCard.vue'

/**
 * 「類型:技能」→ 題型元件。P2 加單字時在這裡登記 vocab:recognize／produce／listen 即可，SessionPage 不用改。
 * 所有題型元件都接同一組 CardProps、送出同樣的 rate 事件；用不到的 prop 忽略。
 */
export interface CardProps {
  item: KanaItem
  pool: KanaItem[]
  isNew: boolean
  intervals: Record<Rating, string>
  /** 本輪第幾次出現 */
  attempt: number
  disabled: boolean
}

export const rendererKey = (type: CardType, skill: Skill) => `${type}:${skill}`

export const CARD_RENDERERS: Record<string, Component> = {
  [rendererKey('kana', 'read')]: RecognizeCard,
  [rendererKey('kana', 'write')]: WriteCard,
}
