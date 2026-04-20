import React from 'react';
import './styles/global.less';
import { Dropdown, Spin } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { getCurrentUser } from '@/services/api/auth';
import UserAvatar from '@/components/UserAvatar';

const TOKEN_KEY = 'auth_token';

interface LayoutInitialState {
  name?: string;
  avatar?: string;
}

interface LayoutRuntimeConfig {
  logout?: (state: LayoutInitialState) => void;
}

function renderRightAvatar(
  initialState: LayoutInitialState | undefined,
  runtimeConfig: LayoutRuntimeConfig,
) {
  if (!initialState) {
    return <div className="umi-plugin-layout-right"><Spin size="small" style={{ marginLeft: 8, marginRight: 8 }} /></div>;
  }

  const showAvatar = initialState.avatar || initialState.name || runtimeConfig.logout;
  if (!showAvatar) return null;

  const avatar = (
    <span className="umi-plugin-layout-action">
      <UserAvatar size="small" className="umi-plugin-layout-avatar" name={initialState.name} src={initialState.avatar} />
      <span className="umi-plugin-layout-name">{initialState.name}</span>
    </span>
  );

  if (!runtimeConfig.logout) return avatar;

  const menuItems = [
    {
      key: 'logout',
      label: <><LogoutOutlined />退出登录</>,
      onClick: () => runtimeConfig.logout?.(initialState),
    },
  ];

  return (
    <div className="umi-plugin-layout-right anticon">
      <Dropdown menu={{ items: menuItems }} overlayClassName="umi-plugin-layout-container">
        {avatar}
      </Dropdown>
    </div>
  );
}

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
  rightRender: (initialState, _setInitialState, runtimeConfig) =>
    renderRightAvatar(initialState as LayoutInitialState, runtimeConfig as LayoutRuntimeConfig),
});

export function onRouteChange({ location }: { location: { pathname: string } }) {
  console.log('[App] 路由变化:', location.pathname);
}
