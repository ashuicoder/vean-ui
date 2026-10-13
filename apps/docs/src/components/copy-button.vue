<script setup lang="ts">
import { computed } from 'vue';
import { useClipboard } from '@vueuse/core';

interface Props {
  codeBase64: string;
}

const props = defineProps<Props>();

const { t } = useI18n();

function decodeBase64ToText(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const code = decodeBase64ToText(props.codeBase64);

const { copy, copied } = useClipboard({
  source: code,
  copiedDuring: 2000
});

// Icon-only control: without a label the button has no accessible name, and the
// same fence-level copy button ships on every code block of the docs.
const label = computed(() => (copied.value ? t('docs.code.copied') : t('docs.code.copy')));
</script>

<template>
  <SButtonIcon
    :icon="copied ? 'lucide:check' : 'lucide:copy'"
    :fit-content="false"
    :aria-label="label"
    class="absolute end-3 top-3 z-10 opacity-78 transition-opacity duration-200 hover:opacity-100"
    @click="copy(code)"
  />
</template>
