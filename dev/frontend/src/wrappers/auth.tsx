import { history, Outlet, useModel } from 'umi';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { getCurrentUser, UserInfo } from '@/services/api/auth';

const TOKEN_KEY = 'auth_token';

export default function AuthWrapper() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  
  // 使用 umi model 共享用户信息
  const { currentUser, setCurrentUser } = useModel('auth');

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      console.log('[AuthWrapper] 检查认证状态，token存在:', !!token);

      if (!token) {
        setLoading(false);
        history.push('/login');
        return;
      }

      try {
        console.log('[AuthWrapper] 正在验证用户信息...');
        const user = await getCurrentUser();
        console.log('[AuthWrapper] 用户验证成功:', user?.name);
        setCurrentUser(user);  // 设置到全局 model
        setAuthenticated(true);
      } catch (error) {
        console.error('[AuthWrapper] 获取用户信息失败:', error);
        localStorage.removeItem(TOKEN_KEY);
        history.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [setCurrentUser]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  console.log('[AuthWrapper] 渲染状态 - authenticated:', authenticated, 'currentUser:', currentUser?.name);

  if (!authenticated) {
    console.log('[AuthWrapper] 未认证，返回 null');
    return null;
  }

  console.log('[AuthWrapper] 已认证，渲染 Outlet');
  return <Outlet />;
}
