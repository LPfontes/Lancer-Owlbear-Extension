<template>
  <preview
    :width="Number(size)"
    :height="Number(size)"
    :image="avatar.image"
    :coordinates="avatar.coordinates"
  />
</template>

<script setup lang="ts">
  import { Preview } from 'vue-advanced-cropper'

  // Monkey-patch vue-advanced-cropper Preview.methods.refreshImage
  // to avoid TypeError when image load event triggers after unmount or when image ref is null
  if (Preview && (Preview as any).methods && (Preview as any).methods.refreshImage) {
    const originalRefreshImage = (Preview as any).methods.refreshImage
    if (!(originalRefreshImage as any).__safePatched) {
      const patched = function (this: any) {
        if (!this?.$refs?.image) return
        return originalRefreshImage.apply(this, arguments)
      }
      patched.__safePatched = true
      ;(Preview as any).methods.refreshImage = patched
    }
  }

  withDefaults(
    defineProps<{
      avatar: { image: { src: string }; coordinates: any }
      size?: number | string
    }>(),
    {
      size: 200,
    }
  )
</script>
