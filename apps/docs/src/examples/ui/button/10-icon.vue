<script setup lang="ts">
import { SButtonIcon } from '@vean/ui';
</script>

<template>
  <div class="flex justify-center w-full">
    <div class="flex flex-wrap gap-3">
      <!--
 纯图标按钮没有可访问名（Lighthouse `button-name`），每个都要显式 aria-label；
           与 01-basic.vue:144 的 `<SButtonIcon … aria-label="Reset">` 同一约定。 
-->
      <SButtonIcon size="lg" icon="lucide:skip-back" aria-label="Skip back" />
      <SButtonIcon size="lg" icon="lucide:skip-forward" aria-label="Skip forward" />
      <SButtonIcon size="lg" icon="lucide:pause" aria-label="Pause" />
      <SButtonIcon size="lg" variant="soft" icon="lucide:rocket" aria-label="Launch" />
      <SButtonIcon size="lg" variant="soft" icon="lucide:star" aria-label="Star" />
      <SButtonIcon size="lg" variant="soft" icon="lucide:heart" aria-label="Like" />
    </div>
  </div>
</template>
