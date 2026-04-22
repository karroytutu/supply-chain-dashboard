import { defineConfig } from 'umi';
import { PERMISSIONS } from './src/constants/permissions';

export default defineConfig({
  plugins: [
    '@umijs/plugins/dist/initial-state',
    '@umijs/plugins/dist/model',
    '@umijs/plugins/dist/request',
    '@umijs/plugins/dist/layout',
  ],
  model: {},
  initialState: {},
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
      permission: PERMISSIONS.DASHBOARD.VIEW.READ,
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
          permission: PERMISSIONS.PROCUREMENT.ARCHIVE.READ,
        },
        {
          path: 'strategic-products',
          name: '战略商品管理',
          icon: 'star',
          component: '@/pages/StrategicProduct',
          permission: PERMISSIONS.STRATEGIC.READ,
        },
        {
          path: 'return',
          name: '临过期退货',
          routes: [
            {
              path: 'orders',
              component: '@/pages/ProcurementReturn/Orders',
              name: '退货单列表',
              permission: PERMISSIONS.RETURN.READ,
            },
            {
              path: 'goods-rules',
              component: '@/pages/ProcurementReturn/GoodsRules',
              name: '采购退货规则',
              permission: PERMISSIONS.GOODS_RULES.READ,
            },
            {
              path: 'penalty',
              component: '@/pages/ProcurementReturn/Penalty',
              name: '考核管理',
              permission: PERMISSIONS.RETURN.PENALTY.READ,
            },
          ],
        },
      ],
    },
    {
      path: '/collection',
      name: '催收管理',
      icon: 'AlertOutlined',
      wrappers: ['@/wrappers/auth'],
      routes: [
        {
          path: 'overview',
          component: '@/pages/Collection/Overview',
          name: '催收总览',
          permission: PERMISSIONS.FINANCE.AR.READ,
        },
        {
          path: 'task/:id',
          component: '@/pages/Collection/TaskDetail',
          name: '任务详情',
          hideInMenu: true,
          permission: PERMISSIONS.FINANCE.AR.READ,
        },
      ],
    },
    {
      path: '/oa',
      name: 'OA审批',
      icon: 'AuditOutlined',
      wrappers: ['@/wrappers/auth'],
      routes: [
        {
          path: 'initiate',
          component: '@/pages/OaApproval/Initiate',
          name: '发起审批',
          permission: PERMISSIONS.OA.APPROVAL.READ,
        },
        {
          path: 'center',
          component: '@/pages/OaApproval/Center',
          name: '审批中心',
          permission: PERMISSIONS.OA.APPROVAL.READ,
        },
        {
          path: 'detail/:id',
          component: '@/pages/OaApproval/Detail',
          name: '审批详情',
          hideInMenu: true,
          permission: PERMISSIONS.OA.APPROVAL.READ,
        },
        {
          path: 'form/:typeCode',
          component: '@/pages/OaApproval/Form',
          name: '填写表单',
          hideInMenu: true,
          permission: PERMISSIONS.OA.APPROVAL.WRITE,
        },
        {
          path: 'data',
          component: '@/pages/OaApproval/Data',
          name: '数据管理',
          permission: PERMISSIONS.OA.DATA.READ,
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
          permission: PERMISSIONS.SYSTEM.USER.READ,
        },
        {
          path: 'roles',
          name: '角色管理',
          component: '@/pages/System/Role',
          permission: PERMISSIONS.SYSTEM.ROLE.READ,
        },
        {
          path: 'permissions',
          name: '权限管理',
          component: '@/pages/System/Permission',
          permission: PERMISSIONS.SYSTEM.PERMISSION.READ,
        },
      ],
    },
  ],
  proxy: {
    '/api': {
      target: 'http://localhost:8100',
      changeOrigin: true,
    },
    '/uploads': {
      target: 'http://localhost:8100',
      changeOrigin: true,
    },
  },
  // 为静态资源添加 hash，解决缓存问题
  hash: true,
  // 构建输出路径 - 输出到 prod 目录
  outputPath: '../../prod/frontend/dist',
});
