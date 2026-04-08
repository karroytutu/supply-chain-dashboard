import { defineConfig } from 'umi';

export default defineConfig({
  plugins: [
    '@umijs/plugins/dist/model',
    '@umijs/plugins/dist/request',
    '@umijs/plugins/dist/layout',
  ],
  model: {},
  layout: {
    title: '鑫链云供应链数据管理系统',
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
      component: '@/pages/Overview',
      name: '数据总览',
      icon: 'dashboard',
      wrappers: ['@/wrappers/auth'],
      permission: 'dashboard:view:read',
    },
    {
      path: '/procurement',
      name: '采购管理',
      icon: 'shopping',
      wrappers: ['@/wrappers/auth'],
      routes: [
        {
          path: 'overview',
          component: '@/pages/ProcurementDashboard',
          name: '采购数据看板',
          permission: 'procurement:archive:read',
        },
        {
          path: 'strategic-products',
          name: '战略商品管理',
          icon: 'star',
          component: '@/pages/StrategicProduct',
          permission: 'strategic:read',
        },
        {
          path: 'return',
          name: '临过期退货',
          routes: [
            {
              path: 'orders',
              component: '@/pages/ProcurementReturn/Orders',
              name: '退货单列表',
              permission: 'return:read',
            },
            {
              path: 'goods-rules',
              component: '@/pages/ProcurementReturn/GoodsRules',
              name: '采购退货规则',
              permission: 'goods-rules:read',
            },
            {
              path: 'penalty',
              component: '@/pages/ProcurementReturn/Penalty',
              name: '考核管理',
            },
          ],
        },
      ],
    },
    {
      path: '/system',
      name: '系统管理',
      icon: 'setting',
      wrappers: ['@/wrappers/auth'],
      routes: [
        {
          path: 'users',
          name: '用户管理',
          component: '@/pages/System/User',
          permission: 'system:user:read',
        },
        {
          path: 'roles',
          name: '角色管理',
          component: '@/pages/System/Role',
          permission: 'system:role:read',
        },
        {
          path: 'permissions',
          name: '权限管理',
          component: '@/pages/System/Permission',
          permission: 'system:permission:read',
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
