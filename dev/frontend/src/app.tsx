import './styles/global.less';

const TOKEN_KEY = 'auth_token';

/**
 * 布局配置
 */
export const layout = () => ({
  layout: 'mix' as const,
  logo: '/logo.png',
  contentStyle: {
    padding: 0,
    background: '#f5f7fa',
  },
  // 退出登录
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
  },
});

export function onRouteChange({ location }: { location: { pathname: string } }) {
  console.log('[App] 路由变化:', location.pathname);
}
