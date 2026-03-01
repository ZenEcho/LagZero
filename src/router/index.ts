import { createRouter, createWebHashHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'


const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', component: () => import('@/views/dashboard/index.vue') },
        { path: 'games', component: () => import('@/views/library/index.vue') },
        { path: 'nodes', component: () => import('@/views/nodes/index.vue') },
        { path: 'settings', component: () => import('@/views/settings/index.vue') },
      ]
    },
    { path: '/tray', component: () => import('@/views/tray/index.vue') }
  ]
})

export default router
