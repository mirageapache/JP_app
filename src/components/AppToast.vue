<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <div v-if="toast.message" class="toast" role="status">{{ toast.message }}</div>
</template>
