import { createRouter, createWebHashHistory } from 'vue-router'
import activeModeRoutes from './features/active_mode/routes'
import gmRoutes from './features/gm/routes'
import pilotRoutes from './features/pilot_management/routes'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/active-mode',
    },
    ...activeModeRoutes.map(route => ({
      ...route,
      path: '/active-mode/' + route.path,
    })),
    ...gmRoutes.map(route => ({
      ...route,
      path: '/gm/' + route.path,
    })),
    ...pilotRoutes.map(route => ({
      ...route,
      path: '/pilot_management' + (route.path ? '/' + route.path : ''),
    })),
    {
      path: '/table-sheets',
      name: 'table-sheets',
      component: () => import('@/features/gm/TableSheetsView.vue'),
    },
    {
      path: '/table-chat',
      name: 'table-chat',
      component: () => import('@/features/active_mode/TableChatView.vue'),
    },
    {
      path: '/new',
      redirect: '/new/no_group',
    },
    {
      path: '/create-pilot',
      redirect: '/new/no_group',
    },
    {
      path: '/active-mode/create-pilot',
      redirect: '/new/no_group',
    },
    {
      path: '/roster',
      redirect: '/pilot_management',
    },
    {
      path: '/pilots',
      redirect: '/pilot_management',
    },
    {
      path: '/npcs/:type?/:id?',
      redirect: to => {
        const type = to.params.type ? `/${to.params.type}` : ''
        const id = to.params.id ? `/${to.params.id}` : ''
        return `/active-mode/npcs${type}${id}`
      },
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

export default router
