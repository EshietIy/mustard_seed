import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { installGlobalErrorHandling } from './errors/global-error';
import { createAppRouter } from './router';
import './styles/base.css';

const app = createApp(App);
installGlobalErrorHandling(app);
app.use(createPinia());
app.use(createAppRouter());
app.mount('#app');
