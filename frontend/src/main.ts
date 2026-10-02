import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { setUnauthorizedHandler } from './api/client';
import { installGlobalErrorHandling } from './errors/global-error';
import { createAppRouter } from './router';
import { useAuthStore } from './stores/auth';
import './styles/base.css';

const app = createApp(App);
installGlobalErrorHandling(app);
app.use(createPinia());
app.use(createAppRouter());
// A 401 from any protected call: ask the customer to sign in again (their cart is kept).
setUnauthorizedHandler((path) => useAuthStore().handleUnauthorized(path));
app.mount('#app');
