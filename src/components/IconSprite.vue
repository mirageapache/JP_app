<script setup lang="ts">
import { ICONS } from './icons'

const symbols = Object.entries(ICONS)
  .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
  .join('')
</script>

<template>
  <!-- 圖示 sprite：放在 App 根層一次，各處以 <AppIcon name="..."> 引用 -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <svg xmlns="http://www.w3.org/2000/svg" style="display: none" aria-hidden="true" v-html="symbols" />
</template>
