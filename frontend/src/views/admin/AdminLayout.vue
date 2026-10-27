<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { canUse, isStaff, roleLabel, sectionsFor, type StaffRole } from '@/admin/sections';
import BrandMark from '@/components/ui/BrandMark.vue';
import ToastHost from '@/components/ui/ToastHost.vue';
import ZigzagTrim from '@/components/ui/ZigzagTrim.vue';
import { landing } from '@/content/landing';
import { useAuthStore } from '@/stores/auth';

/**
 * The staff area's frame: who may enter, the nav for their role, and the current screen.
 * Hiding screens here is a convenience only; every admin endpoint checks the role itself.
 */
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const role = computed(() => auth.user?.role ?? null);
const staff = computed(
  () => auth.status === 'signed-in' && role.value !== null && isStaff(role.value),
);
const sections = computed(() => (role.value ? sectionsFor(role.value) : []));

/** The roles the open screen needs, if it names any (the overview needs only staff). */
const screenRoles = computed(() => route.meta.roles as readonly StaffRole[] | undefined);
const screenAllowed = computed(
  () => !screenRoles.value || (role.value !== null && canUse(role.value, screenRoles.value)),
);

async function signOut(): Promise<void> {
  await auth.signOut();
  await router.push('/');
}
</script>

<template>
  <header class="admin-header">
    <ZigzagTrim size="sm" />
    <div class="bar">
      <RouterLink to="/" class="brand" aria-label="Mustard Seed Restaurant & Bar, back to the site">
        <BrandMark />
        <span class="brand-text">
          <span class="brand-name">{{ landing.brand.name }}</span>
          <span class="brand-sub">Staff area</span>
        </span>
      </RouterLink>
      <div v-if="staff && auth.user" class="who no-print">
        <span class="name">{{ auth.user.firstName || auth.user.email }}</span>
        <span class="role">{{ roleLabel(auth.user.role) }}</span>
        <button type="button" class="sign-out" data-test="admin-sign-out" @click="signOut">
          Sign out
        </button>
      </div>
    </div>
  </header>

  <main class="admin">
    <p v-if="auth.status === 'unknown'" class="state" data-test="admin-loading" aria-live="polite">
      Checking your account…
    </p>

    <section v-else-if="auth.status === 'signed-out'" class="state" data-test="admin-signed-out">
      <h1>Staff sign-in</h1>
      <p>Sign in with the Google account the restaurant set up for you.</p>
      <button type="button" class="btn-primary" @click="auth.openSignIn()">Sign in</button>
    </section>

    <section v-else-if="!staff" class="state" data-test="admin-forbidden">
      <h1>This area is for Mustard Seed staff</h1>
      <p>
        Your account doesn’t have staff access. If you work at the restaurant, ask the manager to
        add your Google email.
      </p>
      <RouterLink to="/" class="btn-primary">Back to the menu</RouterLink>
    </section>

    <div v-else class="frame">
      <nav class="nav no-print" aria-label="Staff screens" data-test="admin-nav">
        <RouterLink :to="{ name: 'admin' }" exact-active-class="active">Overview</RouterLink>
        <RouterLink
          v-for="section in sections"
          :key="section.name"
          :to="{ name: section.name }"
          active-class="active"
        >
          {{ section.label }}
        </RouterLink>
      </nav>
      <div class="screen">
        <RouterView v-if="screenAllowed" />
        <section v-else class="state" data-test="admin-role-refused" role="alert">
          <h1>Your role can’t use this screen</h1>
          <p>Ask a super admin if something here needs changing.</p>
          <RouterLink :to="{ name: 'admin' }" class="btn-primary">Back to the overview</RouterLink>
        </section>
      </div>
    </div>
  </main>
  <ToastHost />
</template>

<style scoped>
.admin-header {
  background: var(--color-cream);
  border-bottom: 1px solid var(--color-border);
}
.bar {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 0.75rem var(--gutter);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem 1rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  color: var(--color-text);
  text-decoration: none;
}
.brand-text {
  display: grid;
  line-height: 1.1;
}
.brand-name {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 600;
}
.brand-sub {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.who {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}
.name {
  font-weight: 600;
}
.role {
  color: var(--color-text-muted);
}
.sign-out {
  padding: 0.375rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font: 600 0.8125rem var(--font-body);
  cursor: pointer;
}
.admin {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 1.5rem var(--gutter) 3rem;
}
.state {
  max-width: 32rem;
  margin: 2rem auto;
  text-align: center;
}
.state h1 {
  margin: 0 0 0.5rem;
  font-size: 2rem;
}
.state p {
  margin: 0 0 1.25rem;
  color: var(--color-text-muted);
}
.state .btn-primary {
  text-decoration: none;
}
.frame {
  display: grid;
  gap: 1.5rem;
}
.nav {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.nav a {
  flex: none;
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-white);
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}
.nav a.active {
  background: var(--color-charcoal);
  border-color: var(--color-charcoal);
  color: var(--color-cream);
}
@media (min-width: 900px) {
  .frame {
    grid-template-columns: 13rem 1fr;
    align-items: start;
  }
  .nav {
    flex-direction: column;
    overflow: visible;
  }
}
@media print {
  .frame {
    display: block;
  }
}
</style>
