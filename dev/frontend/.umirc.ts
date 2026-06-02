import { defineConfig } from 'umi';
import { PERMISSIONS } from './src/constants/permissions';

export default defineConfig({
  plugins: [
    '@umijs/plugins/dist/initial-state',
    '@umijs/plugins/dist/model',
    '@umijs/plugins/dist/request',
    '@umijs/plugins/dist/layout',
    '@umijs/plugins/dist/access',
  ],
  model: {},
  initialState: {},
  access: {},
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
      component: '@/pages/Home',
      name: '工作台',
      icon: 'home',
      wrappers: ['@/wrappers/auth'],
    },
    {
      path: '/overview',
      component: '@/pages/Overview',
      name: '数据总览',
      icon: 'dashboard',
      wrappers: ['@/wrappers/auth'],
      access: PERMISSIONS.DASHBOARD.VIEW.READ,
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
          access: PERMISSIONS.PROCUREMENT.ARCHIVE.READ,
        },
        {
          path: 'strategic-products',
          name: '战略商品管理',
          icon: 'star',
          component: '@/pages/StrategicProduct',
          access: PERMISSIONS.STRATEGIC.READ,
        },
        {
          path: 'return',
          name: '临过期退货',
          routes: [
            {
              path: 'orders',
              component: '@/pages/ProcurementReturn/Orders',
              name: '退货单列表',
              access: PERMISSIONS.RETURN.READ,
            },
            {
              path: 'goods-rules',
              component: '@/pages/ProcurementReturn/GoodsRules',
              name: '采购退货规则',
              access: PERMISSIONS.GOODS_RULES.READ,
            },
            {
              path: 'penalty',
              redirect: '/assessment?category=return_order',
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
          access: PERMISSIONS.FINANCE.AR.READ,
        },
        {
          path: 'task/:id',
          component: '@/pages/Collection/TaskDetail',
          name: '任务详情',
          hideInMenu: true,
          access: PERMISSIONS.FINANCE.AR.READ,
        },
        {
          path: 'assessment',
          redirect: '/assessment?category=ar_collection',
        },
      ],
    },
    {
      path: '/assessment',
      name: '考核中心',
      icon: 'AuditOutlined',
      component: '@/pages/Assessment/index',
      wrappers: ['@/wrappers/auth'],
      access: PERMISSIONS.ASSESSMENT.READ,
    },
    {
      path: '/oa/quick-action',
      component: '@/pages/OaApproval/QuickAction',
      name: '快速审批',
      hideInMenu: true,
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
          access: PERMISSIONS.OA.APPROVAL.READ,
        },
        {
          path: 'center',
          component: '@/pages/OaApproval/Center',
          name: '审批中心',
          access: PERMISSIONS.OA.APPROVAL.READ,
        },
        {
          path: 'detail/:id',
          component: '@/pages/OaApproval/Detail',
          name: '审批详情',
          hideInMenu: true,
          access: PERMISSIONS.OA.APPROVAL.READ,
        },
        {
          path: 'form/:typeCode',
          component: '@/pages/OaApproval/Form',
          name: '填写表单',
          hideInMenu: true,
          access: PERMISSIONS.OA.APPROVAL.WRITE,
        },
        {
          path: 'data',
          component: '@/pages/OaApproval/Data',
          name: '数据管理',
          access: PERMISSIONS.OA.DATA.READ,
        },
      ],
    },
    {
      path: '/sales',
      name: '销售分析',
      icon: 'BarChartOutlined',
      wrappers: ['@/wrappers/auth'],
      routes: [
        {
          path: 'analysis',
          component: '@/pages/SalesAnalysis',
          name: '首页总览',
          access: PERMISSIONS.SALES.ANALYSIS.READ,
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
          access: PERMISSIONS.SYSTEM.USER.READ,
        },
        {
          path: 'roles',
          name: '角色管理',
          component: '@/pages/System/Role',
          access: PERMISSIONS.SYSTEM.ROLE.READ,
        },
        {
          path: 'permissions',
          name: '权限管理',
          component: '@/pages/System/Permission',
          access: PERMISSIONS.SYSTEM.PERMISSION.READ,
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
