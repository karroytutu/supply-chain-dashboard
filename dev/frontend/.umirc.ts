import { defineConfig } from 'umi';

export default defineConfig({
  plugins: [
    '@umijs/plugins/dist/model',
    '@umijs/plugins/dist/request',
    '@umijs/plugins/dist/layout',
  ],
  layout: {
    title: '供应链数据总览',
  },
  npmClient: 'npm',
  routes: [
    {
      path: '/login',
      component: '@/pages/Login',
      layout: false,
    },
    {
      path: '/login/callback',
      component: '@/pages/LoginCallback',
      layout: false,
    },
    {
      path: '/',
      component: '@/pages/Dashboard',
      name: '数据总览',
      icon: 'dashboard',
      wrappers: ['@/wrappers/auth'],
    },
    {
      path: '/strategic-products',
      name: '战略商品管理',
      icon: 'star',
      component: '@/pages/StrategicProduct',
      wrappers: ['@/wrappers/auth'],
    },
    {
      path: '/system',
      name: '系统管理',
      icon: 'setting',
      wrappers: ['@/wrappers/auth'],
      routes: [
        {
          path: '/system/users',
          name: '用户管理',
          component: '@/pages/System/User',
        },
        {
          path: '/system/roles',
          name: '角色管理',
          component: '@/pages/System/Role',
        },
        {
          path: '/system/permissions',
          name: '权限管理',
          component: '@/pages/System/Permission',
        },
      ],
    },
  ],
  proxy: {
    '/api': {
      target: 'http://localhost:8100',
      changeOrigin: true,
    },
  },
  // 为静态资源添加 hash，解决缓存问题
  hash: true,
  // 构建输出路径 - 输出到 prod 目录
  outputPath: '../../prod/frontend/dist',
});
