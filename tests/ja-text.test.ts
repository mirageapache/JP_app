import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import JaText from '@/components/JaText.vue'

describe('JaText', () => {
  it('一律標示 lang="ja"，display 時使用教科書體', () => {
    const w = mount(JaText, { props: { text: 'あ', display: true, tag: 'div' } })
    expect(w.element.tagName).toBe('DIV')
    expect(w.attributes('lang')).toBe('ja')
    expect(w.classes()).toContain('ja-display')
    expect(w.text()).toBe('あ')
  })

  it('分段資料顯示讀音標注，可關閉，並標記文法目標', () => {
    const segments = [{ text: '書', ruby: 'か' }, { text: 'い' }, { text: 'てください', target: true }]
    const w = mount(JaText, { props: { segments } })
    expect(w.find('ruby').exists()).toBe(true)
    expect(w.find('rt').text()).toBe('か')
    expect(w.find('.target').text()).toBe('てください')
    const w2 = mount(JaText, { props: { segments, showRuby: false } })
    expect(w2.find('ruby').exists()).toBe(false)
    expect(w2.text()).toBe('書いてください')
  })
})
