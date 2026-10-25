import { describe, expect, it } from 'vitest'
import pack from '../../../public/content/kana.json'
import { kanaCardId, kanaTable, type KanaPack } from './kana'

const kana = pack as unknown as KanaPack

describe('kana 內容包', () => {
  it('平假名清音有 46 個，排成 11 行', () => {
    const table = kanaTable(kana.items, 'hiragana', 'seion')
    expect(table).toHaveLength(11)
    expect(table.flat().filter(Boolean)).toHaveLength(46)
    expect(table[0]!.map((i) => (i ? i.char : null))).toEqual(['あ', 'い', 'う', 'え', 'お'])
    expect(table[7]!.map((i) => (i ? i.char : null))).toEqual(['や', null, 'ゆ', null, 'よ'])
  })

  it('每個項目的 ID 唯一、order 遞增、拗音沒有手寫技能', () => {
    const ids = new Set(kana.items.map((i) => i.id))
    expect(ids.size).toBe(kana.items.length)
    for (let i = 1; i < kana.items.length; i++) expect(kana.items[i]!.order).toBeGreaterThan(kana.items[i - 1]!.order)
    for (const item of kana.items) {
      if (item.group === 'youon') expect(item.skills).toEqual(['read'])
      else expect(item.skills).toEqual(['read', 'write'])
    }
  })

  it('濁音與小寫假名都有筆畫數', () => {
    for (const item of kana.items.filter((i) => i.group !== 'youon')) {
      expect(item.strokeCount, item.char).toBeGreaterThan(0)
    }
  })

  it('卡片 ID = 項目 ID + # + 技能', () => {
    expect(kanaCardId('あ', 'write')).toBe('kana:あ#write')
  })
})
