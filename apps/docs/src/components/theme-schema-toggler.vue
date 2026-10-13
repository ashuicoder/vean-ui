<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useTheme } from '@vean/ui';

const { t } = useI18n();
const { mode } = useTheme();
</script>

<template>
  <!-- `mode` is a 'light' | 'dark' string, so map the switch's boolean state to those values -->
  <SSwitch
    v-model="mode"
    color="accent"
    size="lg"
    true-value="dark"
    false-value="light"
    :control-props="{ 'aria-label': t('layout.header.theme') }"
  >
    <SIcon :icon="mode === 'dark' ? 'lucide:moon' : 'lucide:sun'" />
  </SSwitch>
</template>
