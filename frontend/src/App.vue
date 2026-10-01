<script setup lang="ts">
import { RouterView } from 'vue-router';
import ErrorBoundary from '@/components/ErrorBoundary.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';
import TestModeBanner from '@/components/TestModeBanner.vue';
import { globalError } from '@/errors/global-error';

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <TestModeBanner />
  <ErrorScreen v-if="globalError" :error="globalError" @retry="reload" />
  <ErrorBoundary v-else>
    <RouterView />
  </ErrorBoundary>
</template>
