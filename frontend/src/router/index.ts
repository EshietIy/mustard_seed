import { createRouter, createWebHistory } from 'vue-router';
import { adminSections } from '@/admin/sections';
import HomeView from '@/views/HomeView.vue';

const AdminPendingView = () => import('@/views/admin/AdminPendingView.vue');

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
      // Each screen replaces AdminPendingView as slice 8 builds it.
      ...adminSections.map((section) => ({
        path: section.path,
        name: section.name,
        component: AdminPendingView,
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
