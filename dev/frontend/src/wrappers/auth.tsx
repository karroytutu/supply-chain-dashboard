import { history, Outlet, useModel } from 'umi';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { getCurrentUser, UserInfo } from '@/services/api/auth';

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
        history.push('/login');
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
      } catch (error) {
        console.error('[AuthWrapper] 获取用户信息失败:', error);
        localStorage.removeItem(TOKEN_KEY);
        setGlobalUser(null);
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return <Outlet />;
}
