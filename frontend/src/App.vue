<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import SignInDialog from '@/components/auth/SignInDialog.vue';
import ErrorBoundary from '@/components/ErrorBoundary.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';
import TestModeBanner from '@/components/TestModeBanner.vue';
import { globalError } from '@/errors/global-error';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
onMounted(() => {
  if (auth.status === 'unknown') void auth.loadSession();
});

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
  <SignInDialog />
</template>
