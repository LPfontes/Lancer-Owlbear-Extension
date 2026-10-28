<template>
  <div class="token-status-embed">
    <TokenStatusMenu />
  </div>
</template>

<script setup lang="ts">
import TokenStatusMenu from './TokenStatusMenu.vue'
</script>

<style scoped>
.token-status-embed {
  background: #0f1218;
  color: #e2e8f0;
  min-height: 100%;
}
</style>
