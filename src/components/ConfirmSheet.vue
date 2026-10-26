<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

/**
 * 底部確認面板（design-system §6「Sheet」）。開啟時把焦點移進面板、Esc 關閉；
 * 內容與按鈕由呼叫端用 slot 放入，危險操作用 .btn--danger-fill。
 */
const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const id = useId()
const panel = ref<HTMLElement>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      document.addEventListener('keydown', onKey)
      await nextTick()
      const first = panel.value?.querySelector<HTMLElement>('input, button')
      first?.focus()
    } else document.removeEventListener('keydown', onKey)
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-backdrop" @click="emit('close')" />
    <div v-if="open" ref="panel" class="sheet" role="dialog" aria-modal="true" :aria-labelledby="id">
      <div class="sheet__handle"></div>
      <h2 :id="id" style="font-size: var(--fs-title)">{{ title }}</h2>
      <slot />
    </div>
  </Teleport>
</template>
