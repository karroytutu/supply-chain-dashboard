import { useState, useCallback } from 'react';
import { getCurrentUser, logout as logoutApi, UserInfo } from '@/services/api/auth';

const TOKEN_KEY = 'auth_token';

export default function useAuth() {
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // 获取Token
  const getToken = useCallback(() => {
    return localStorage.getItem(TOKEN_KEY);
  }, []);

  // 设置Token
  const setToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
  }, []);

  // 清除Token
  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  // 获取当前用户信息
  const fetchCurrentUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      return null;
    }

    setLoading(true);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      return user;
    } catch (error) {
      clearToken();
      return null;
    } finally {
      setLoading(false);
    }
  }, [getToken, clearToken]);

  // 登录成功后设置Token
  const login = useCallback((token: string, user?: UserInfo) => {
    setToken(token);
    if (user) {
      setCurrentUser(user);
    }
  }, [setToken]);

  // 登出
  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch (error) {
      // ignore
    }
    clearToken();
    setCurrentUser(null);
  }, [clearToken]);

  // 检查是否已登录
  const isLoggedIn = useCallback(() => {
    return !!getToken();
  }, [getToken]);

  // 设置当前用户信息（供外部调用，如 AuthWrapper）
  const updateCurrentUser = useCallback((user: UserInfo | null) => {
    setCurrentUser(user);
  }, []);

  return {
    currentUser,
    loading,
    getToken,
    setToken,
    clearToken,
    fetchCurrentUser,
    login,
    logout,
    isLoggedIn,
    setCurrentUser: updateCurrentUser,
  };
}
