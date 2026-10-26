<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

/**
 * 底部確認面板（design-system §6「Sheet」）。開啟時把焦點移進面板、Esc 關閉；
 * 內容與按鈕由呼叫端用 slot 放入，危險操作用 .btn--danger-fill。
 */
/** center：面板置中（含輸入框時用，iOS 鍵盤彈出不會蓋住貼底的面板） */
const props = defineProps<{ open: boolean; title: string; center?: boolean }>()
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
    <div v-if="open" ref="panel" class="sheet" :class="{ 'sheet--center': center }" role="dialog" aria-modal="true" :aria-labelledby="id">
      <div v-if="!center" class="sheet__handle"></div>
      <h2 :id="id" style="font-size: var(--fs-title)">{{ title }}</h2>
      <slot />
    </div>
  </Teleport>
</template>
