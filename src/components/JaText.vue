<script setup lang="ts">
/**
 * 日文文字共用元件（規劃書 §6.6、design-system §3.1）：
 * 固定加上 lang="ja"，iOS 才會以日文字型顯示漢字；display 為 true 時使用教科書體（Klee One）。
 * 可傳入分段資料顯示讀音標注（內容包的 segments 格式）；showRuby 為 false 時只顯示本文。
 */
export interface JaSegment {
  text: string
  ruby?: string
  /** 文法目標片段（挖空題用） */
  target?: boolean
}

withDefaults(
  defineProps<{
    text?: string
    segments?: JaSegment[]
    display?: boolean
    showRuby?: boolean
    tag?: string
  }>(),
  { text: '', segments: undefined, display: false, showRuby: true, tag: 'span' },
)
</script>

<template>
  <component :is="tag" lang="ja" :class="display ? 'ja-display' : undefined">
    <template v-if="segments">
      <template v-for="(s, i) in segments" :key="i">
        <ruby v-if="s.ruby && showRuby" :class="{ target: s.target }">{{ s.text }}<rt>{{ s.ruby }}</rt></ruby>
        <span v-else :class="{ target: s.target }">{{ s.text }}</span>
      </template>
    </template>
    <template v-else>{{ text }}</template>
  </component>
</template>
