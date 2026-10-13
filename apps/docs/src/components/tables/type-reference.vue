<script setup lang="ts">
import { computed, inject, shallowRef } from 'vue';
import { SHoverCard } from '@vean/ui/hover-card';
import {
  getCommonTypePreview,
  getComponentTypePreview,
  getExternalTypeImportSignature,
  loadFullApiRegistry
} from './generated-api';
import { normalizeTypeRenderContext, typeRenderContextKey } from './type-anchor';
import TypePreviewCard from './type-preview-card.vue';

interface Props {
  name: string;
}

const props = defineProps<Props>();

const typeRenderContext = inject(
  typeRenderContextKey,
  computed(() => normalizeTypeRenderContext())
);

// Type hover previews span every component, so they need the full generated API
// registry (~12 MB). It is fetched on first hover instead of on page load, which
// keeps the registries empty during SSR — the fallback is the plain type name.
const registryReady = shallowRef(false);

async function ensureRegistry() {
  if (registryReady.value) {
    return;
  }

  await loadFullApiRegistry();
  registryReady.value = true;
}

const localPreview = computed(() => {
  const componentName = typeRenderContext.value.component;

  if (!registryReady.value || !componentName) {
    return null;
  }

  return getComponentTypePreview(componentName, props.name);
});

const commonPreview = computed(() => (registryReady.value ? getCommonTypePreview(props.name) : null));

const preview = computed(() => localPreview.value ?? commonPreview.value);
const externalImportSignature = computed(() =>
  registryReady.value ? getExternalTypeImportSignature(props.name) : null
);
const isActivePreviewType = computed(() => typeRenderContext.value.activePreviewNames?.includes(props.name));
const hasHoverContent = computed(
  () => !isActivePreviewType.value && Boolean(preview.value || externalImportSignature.value)
);
</script>

<template>
  <SHoverCard v-if="hasHoverContent" :open-delay="180" :close-delay="120" class="w-max p-0">
    <template #trigger>
      <button
        type="button"
        class="text-primary border-b-2 border-dashed border-primary/30 hover:border-primary duration-200"
      >
        {{ name }}
      </button>
    </template>

    <TypePreviewCard v-if="preview" :href="null" :preview="preview" />

    <div v-else class="rounded-md border bg-popover px-3 py-2 text-xs font-mono text-foreground shadow-sm">
      {{ externalImportSignature }}
    </div>
  </SHoverCard>

  <span v-else @mouseenter="ensureRegistry">{{ name }}</span>
</template>
