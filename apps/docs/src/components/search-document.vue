<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef, watch } from 'vue';
import { useMagicKeys } from '@vueuse/core';

const SearchDialog = defineAsyncComponent(() => import('./search-dialog.vue'));

const searchOpen = shallowRef(false);
const dialogMounted = shallowRef(false);
const keys = useMagicKeys();
const CmdK = computed(() => keys['Cmd+K']?.value);

function handleOpenChange() {
  dialogMounted.value = true;
  searchOpen.value = !searchOpen.value;
}

watch(CmdK, pressed => {
  if (pressed) {
    handleOpenChange();
  }
});
</script>

<template>
  <SDialog v-model:open="searchOpen" pure :show-close="false">
    <template #trigger>
      <SButton color="accent" variant="soft" :aria-label="$t('layout.header.search')" @click="dialogMounted = true">
        <SIcon icon="lucide:search" class="text-base" />
        <span class="hidden sm:inline">{{ $t('layout.header.search') }}</span>
        <SKbd :value="['command', 'k']" class="ms-auto" />
      </SButton>
    </template>
    <!--
      Mounted only on first open: the panel body imports the changelog graph
      (releases.json ≈ 1.5 MB), which must not sit in the first-load JS of pages
      that never open search.
    -->
    <SearchDialog v-if="dialogMounted" v-model:open="searchOpen" />
  </SDialog>
</template>
