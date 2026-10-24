<script setup lang="ts">
import IconSprite from '@/components/IconSprite.vue'
import PwaUpdatePrompt from '@/components/PwaUpdatePrompt.vue'
</script>

<template>
  <IconSprite />
  <RouterView />
  <PwaUpdatePrompt />
</template>
