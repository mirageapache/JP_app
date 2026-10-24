<script setup lang="ts">
import type { IconName } from './icons'

defineProps<{
  name: IconName
  /** sm = 18px、md = 22px（預設）、lg = 28px */
  size?: 'sm' | 'md' | 'lg'
}>()
</script>

<template>
  <svg class="i" :class="size && size !== 'md' ? size : undefined" aria-hidden="true">
    <use :href="`#i-${name}`" />
  </svg>
</template>
