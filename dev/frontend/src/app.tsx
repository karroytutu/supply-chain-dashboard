import './styles/global.less';
import { getCurrentUser } from '@/services/api/auth';

const TOKEN_KEY = 'auth_token';

/**
 * 获取初始状态，供 layout 插件读取用户头像和用户名
 */
export async function getInitialState() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return { name: '', avatar: '' };
  }

  try {
    const user = await getCurrentUser();
    return {
      name: user.name,
      avatar: user.avatar,
    };
  } catch {
    return { name: '', avatar: '' };
  }
}

/**
 * 布局配置
 */
export const layout = () => ({
  layout: 'mix' as const,
  logo: '/logo.png',
  siderWidth: 180,
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
