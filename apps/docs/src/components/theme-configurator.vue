<script setup lang="ts">
import { ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { SButtonIcon, SPopover, SThemeCustomizer } from '@vean/ui';
import { mobileViewportQuery } from '@vean/aria/shared';
import { loadDocsFontStylesheet } from '../shared/fonts';

const { t } = useI18n();
const isMobile = useMediaQuery(mobileViewportQuery);

const open = ref(false);

/**
 * The customizer's font controls are the only consumer of the Google Fonts
 * stylesheet. Declaring 25 families in the head made it a render-blocking
 * document on every page (measured: ~826 ms in Lighthouse's
 * `render-blocking-insight`), so it is now requested on first open instead —
 * still ahead of the picker, but off the first-view critical path.
 */
watch(open, value => {
  if (value) {
    void loadDocsFontStylesheet();
  }
});
</script>

<template>
  <SPopover v-model:open="open" :modal="false" :placement="isMobile ? 'left' : 'bottom-end'">
    <template #trigger>
      <SButtonIcon icon="lucide:swatch-book" size="lg" :aria-label="t('layout.header.theme_configurator')" />
    </template>
    <SThemeCustomizer />
  </SPopover>
</template>
