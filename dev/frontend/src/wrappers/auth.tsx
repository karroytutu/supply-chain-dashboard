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
  const currentUser = authModel.currentUser;

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
      } catch (error) {
        console.error('[AuthWrapper] 获取用户信息失败:', error);
        localStorage.removeItem(TOKEN_KEY);
        setGlobalUser(null);
        history.push('/login');
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
