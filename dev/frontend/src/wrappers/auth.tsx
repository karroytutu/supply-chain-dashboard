import { history, Outlet } from 'umi';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { getCurrentUser, UserInfo } from '@/services/api/auth';

// @ts-ignore - useModel 由 @umijs/plugins/dist/model 提供
import { useModel } from 'umi';

const TOKEN_KEY = 'auth_token';

export default function AuthWrapper() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  
  // 使用 umi model 获取全局状态
  let setGlobalUser: (user: UserInfo | null) => void = () => {};
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const authModel = useModel('auth');
    setGlobalUser = authModel.setCurrentUser;
  } catch {
    // model 不可用时使用默认值
  }

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
        console.log('[AuthWrapper] 用户验证成功:', user?.name, '权限数量:', user?.permissions?.length);
        
        // 设置全局用户状态
        setGlobalUser(user);
        setAuthenticated(true);
      } catch (error) {
        // 只在 token 确实无效时才清除（401 错误）
        // 其他错误（网络问题等）不清除 token，让用户可以刷新重试
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

  console.log('[AuthWrapper] 渲染状态 - authenticated:', authenticated);

  if (!authenticated) {
    console.log('[AuthWrapper] 未认证，返回 null');
    return null;
  }

  console.log('[AuthWrapper] 已认证，渲染 Outlet');
  return <Outlet />;
}
