import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';

export const routes = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

export function createAppRouter() {
  return createRouter({ history: createWebHistory(), routes });
}
