<script setup lang="ts">
import { SButton } from '@vean/ui';
import type { ThemeColor } from '@vean/ui';

defineOptions({
  name: 'ThemeEditorPreviewContrast'
});

const primaryFills: ThemeColor[] = ['primary', 'secondary', 'accent', 'carbon'];

const statusFills: ThemeColor[] = ['destructive', 'success', 'warning', 'info'];

/** the fill ↔ foreground pairs, declared as tokens so both sides show. */
const pairs = [
  { token: 'primary', class: 'bg-primary text-primary-foreground' },
  { token: 'secondary', class: 'bg-secondary text-secondary-foreground' },
  { token: 'accent', class: 'bg-accent text-accent-foreground' },
  { token: 'carbon', class: 'bg-carbon text-carbon-foreground' },
  { token: 'destructive', class: 'bg-destructive text-destructive-foreground' },
  { token: 'success', class: 'bg-success text-success-foreground' },
  { token: 'warning', class: 'bg-warning text-warning-foreground' },
  { token: 'info', class: 'bg-info text-info-foreground' }
];
</script>

<template>
  <div class="space-y-2">
    <p class="text-xs text-muted-foreground">Solid fills — SButton on every role</p>
    <div class="flex flex-wrap items-center gap-3">
      <SButton v-for="color in primaryFills" :key="color" :color="color">{{ color }}</SButton>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <SButton v-for="color in statusFills" :key="color" :color="color">{{ color }}</SButton>
      <SButton v-for="color in statusFills" :key="`soft-${color}`" :color="color" variant="soft">soft</SButton>
    </div>
  </div>

  <div class="space-y-2">
    <p class="text-xs text-muted-foreground">Fill ↔ foreground pairs — every fill with its declared text</p>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="pair in pairs"
        :key="pair.token"
        :class="pair.class"
        class="flex h-16 flex-col justify-center gap-1 rounded-md px-3"
      >
        <span class="font-mono text-2xs">--{{ pair.token }}</span>
        <span class="text-sm font-medium">Readable text</span>
      </div>
    </div>
  </div>
</template>
