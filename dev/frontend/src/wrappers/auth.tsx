import { history, Outlet, useModel } from 'umi';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '@/services/api/auth';
import { createLogger } from '../utils/logger';
const log = createLogger('Auth');

const TOKEN_KEY = 'auth_token';

export default function AuthWrapper() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  
  // 使用 umi model 获取全局状态
  const authModel = useModel('auth');
  const setGlobalUser = authModel.setCurrentUser;

  // 获取 initialState 的 setInitialState，用于同步更新 access 权限
  // 防止 getInitialState 失败后 AuthWrapper 成功但 access 仍为空的不一致问题
  const { setInitialState } = useModel('@@initialState');

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEY);

      if (!token) {
        setLoading(false);
        // 保留当前路径和查询参数作为登录后重定向目标
        const currentPath = history.location.pathname + history.location.search;
        history.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      try {
        const user = await getCurrentUser();
        
        // 设置全局用户状态
        setGlobalUser(user);
        setAuthenticated(true);

        // 同步更新 initialState，确保 access 插件的权限判断与当前用户一致
        // 避免 getInitialState 失败返回空权限但 AuthWrapper 成功的不一致状态
        setInitialState((s: any) => ({
          ...s,
          name: user.name,
          avatar: user.avatar,
          permissions: user.permissions || [],
          roles: user.roles?.map((r: any) => r.code) || [],
        }));
        setLoading(false);
      } catch (error) {
        log.error('获取用户信息失败:', error);
        localStorage.removeItem(TOKEN_KEY);
        setGlobalUser(null);
        const currentPath = history.location.pathname + history.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        // 不设置 setLoading(false)，保持 Spin 加载状态直到页面跳转生效
        // 避免在跳转前渲染出空白或 403 页面
        return;
      }
    };

    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return <Outlet />;
}
