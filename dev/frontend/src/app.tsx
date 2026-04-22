import React from 'react';
import './styles/global.less';
import { Dropdown, Spin, Tag } from 'antd';
import { LogoutOutlined, SwapOutlined } from '@ant-design/icons';
import { getCurrentUser } from '@/services/api/auth';
import UserAvatar from '@/components/UserAvatar';
import DevUserSwitcher from '@/components/DevUserSwitcher';

const TOKEN_KEY = 'auth_token';
const isDev = process.env.NODE_ENV === 'development';

interface LayoutInitialState {
  name?: string;
  avatar?: string;
}

interface LayoutRuntimeConfig {
  logout?: (state: LayoutInitialState) => void;
}

/**
 * 右上角头像及菜单组件
 * 开发环境下显示用户切换功能
 */
function RightAvatar({
  initialState,
  setInitialState,
  runtimeConfig,
}: {
  initialState: LayoutInitialState | undefined;
  setInitialState: (state: LayoutInitialState | ((prev: LayoutInitialState) => LayoutInitialState)) => void;
  runtimeConfig: LayoutRuntimeConfig;
}) {
  if (!initialState) {
    return (
      <div className="umi-plugin-layout-right">
        <Spin size="small" style={{ marginLeft: 8, marginRight: 8 }} />
      </div>
    );
  }

  const showAvatar = initialState.avatar || initialState.name || runtimeConfig.logout;
  if (!showAvatar) return null;

  const avatar = (
    <span className="umi-plugin-layout-action">
      <UserAvatar
        size="small"
        className="umi-plugin-layout-avatar"
        name={initialState.name}
        src={initialState.avatar}
      />
      <span className="umi-plugin-layout-name">{initialState.name}</span>
    </span>
  );

  if (!runtimeConfig.logout) return avatar;

  const menuItems: any[] = [
    {
      key: 'logout',
      label: (
        <>
          <LogoutOutlined />
          退出登录
        </>
      ),
      onClick: () => runtimeConfig.logout?.(initialState),
    },
  ];

  // 开发环境：在退出登录上方插入切换用户入口（弹出搜索面板）
  if (isDev) {
    menuItems.unshift({
      key: 'switch-user',
      label: (
        <DevUserSwitcher
          onSwitch={(name, avatar) => {
            setInitialState((s) => ({ ...s, name, avatar }));
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <SwapOutlined />
            切换用户
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 10, lineHeight: '14px' }}>
              dev
            </Tag>
          </span>
        </DevUserSwitcher>
      ),
    });
  }

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
  rightRender: (
    initialState: LayoutInitialState | undefined,
    setInitialState: unknown,
    runtimeConfig: LayoutRuntimeConfig,
  ) => (
    <RightAvatar
      initialState={initialState}
      setInitialState={setInitialState as any}
      runtimeConfig={runtimeConfig}
    />
  ),
});

export function onRouteChange({ location }: { location: { pathname: string } }) {
  console.log('[App] 路由变化:', location.pathname);
}
