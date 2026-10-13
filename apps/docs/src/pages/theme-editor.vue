<script setup lang="ts">
// Imported explicitly: page components are registered by file name too, so an
// auto-imported `<ThemeEditor />` here would resolve to this page itself.
import { useI18n } from 'vue-i18n';
import ThemeEditor from '~/components/theme-editor/index.vue';
import { usePageHead } from '~/composables/use-page-head';

const { t } = useI18n();

definePage({ layout: 'default' });

usePageHead(() => ({
  title: t('themeEditor.title'),
  description: t('themeEditor.description')
}));
</script>

<template>
  <ThemeEditor />
</template>
