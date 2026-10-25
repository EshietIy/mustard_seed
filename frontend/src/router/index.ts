import { createRouter, createWebHistory } from 'vue-router';
import { adminSections, type AdminSectionName } from '@/admin/sections';
import HomeView from '@/views/HomeView.vue';

/** One screen per staff section (admin/sections.ts). */
const adminScreens: Record<AdminSectionName, () => Promise<unknown>> = {
  'admin-availability': () => import('@/views/admin/AdminAvailabilityView.vue'),
  'admin-meats': () => import('@/views/admin/AdminMeatsView.vue'),
  'admin-prices': () => import('@/views/admin/AdminPricesView.vue'),
  'admin-photos': () => import('@/views/admin/AdminPhotosView.vue'),
  'admin-staff': () => import('@/views/admin/AdminStaffView.vue'),
};

export const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/checkout', name: 'checkout', component: () => import('@/views/CheckoutView.vue') },
  { path: '/orders/:id', name: 'order', component: () => import('@/views/OrderView.vue') },
  { path: '/track/:token', name: 'track', component: () => import('@/views/TrackView.vue') },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    children: [
      { path: '', name: 'admin', component: () => import('@/views/admin/AdminHomeView.vue') },
      ...adminSections.map((section) => ({
        path: section.path,
        name: section.name,
        component: adminScreens[section.name],
        meta: { roles: section.roles },
      })),
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash } : { top: 0 }),
  });
}
