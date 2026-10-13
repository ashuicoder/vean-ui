<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { encodeBase64Utf8 } from '~/shared/encode';
import { highlightToHtml } from '~/shared/highlight';

interface Props {
  code: string;
  lang: string;
}

const props = defineProps<Props>();

const wrapper = useTemplateRef('wrapper');

let observer: IntersectionObserver | undefined;

async function renderCode() {
  observer?.disconnect();
  observer = undefined;

  const html = await highlightToHtml(props.code, props.lang);

  if (wrapper.value) {
    wrapper.value.innerHTML = html;
  }
}

onMounted(() => {
  // Shiki is the heaviest script on a code-bearing page: the Oniguruma engine
  // plus the grammars and themes add up to ~250 KB of transfer and roughly 1.2 s
  // of main-thread time for the button examples. Running it only when the block
  // approaches the viewport keeps that work out of the initial load, where the
  // code is normally still below the fold.
  observer = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        void renderCode();
      }
    },
    { rootMargin: '200px' }
  );

  if (wrapper.value) {
    observer.observe(wrapper.value);
  }
});

onUnmounted(() => {
  observer?.disconnect();
});

const result = computed(() => encodeBase64Utf8(props.code));
</script>

<template>
  <div class="markdown-wrapper">
    <div ref="wrapper" class="md-code-block" :data-lang="lang" />
    <CopyButton :code-base64="result" />
  </div>
</template>
