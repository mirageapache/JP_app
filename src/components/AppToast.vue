<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useToastStore } from '@/stores/toast'

/** 全站 Toast；有 tabbar 的頁面（route.meta.tabbar）浮在 tabbar 上方，其他頁貼近底部 */
const toast = useToastStore()
const route = useRoute()
</script>

<template>
  <div v-if="toast.message" class="toast" :class="{ 'toast--flush': !route.meta.tabbar }" role="status">{{ toast.message }}</div>
</template>
