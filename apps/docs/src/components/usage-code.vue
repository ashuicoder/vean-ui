<script setup lang="ts">
import { computed, onServerPrefetch, shallowRef, watchEffect } from 'vue';
import { loadPlaygroundExampleCode } from '~/constants/globs';

interface Props {
  component: string;
  file?: string;
}

const props = withDefaults(defineProps<Props>(), {
  file: 'basic'
});

const code = shallowRef<string>();
const missingTitle = computed(() => `${props.component}/${props.file} not found`);

async function loadCode() {
  code.value = await loadPlaygroundExampleCode(props.component, props.file);
}

onServerPrefetch(() => loadCode());

watchEffect(() => {
  loadCode();
});
</script>

<template>
  <CodeBlock v-if="code" :code="code" lang="vue" />
  <SAlert v-else color="destructive" :title="missingTitle" icon="lucide:alert-circle" />
</template>
