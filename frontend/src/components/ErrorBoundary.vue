<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
import ErrorScreen from './ErrorScreen.vue';

const error = ref<unknown>(null);
const renderKey = ref(0);

onErrorCaptured((err) => {
  error.value = err;
  return false;
});

function retry(): void {
  error.value = null;
  renderKey.value += 1;
}
</script>

<template>
  <ErrorScreen v-if="error" :error="error" @retry="retry" />
  <div v-else :key="renderKey" class="contents">
    <slot />
  </div>
</template>

<style scoped>
.contents {
  display: contents;
}
</style>
