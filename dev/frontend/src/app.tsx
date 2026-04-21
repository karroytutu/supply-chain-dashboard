import React, { useState, useEffect } from 'react';
import './styles/global.less';
import { Dropdown, Spin, Tag } from 'antd';
import { LogoutOutlined, SwapOutlined } from '@ant-design/icons';
import { getCurrentUser, devSwitchUser, devGetUsers } from '@/services/api/auth';
import UserAvatar from '@/components/UserAvatar';

const TOKEN_KEY = 'auth_token';
const isDev = process.env.NODE_ENV === 'development';

interface LayoutInitialState {
  name?: string;
  avatar?: string;
}

interface LayoutRuntimeConfig {
  logout?: (state: LayoutInitialState) => void;
}

interface UserItem {
  id: number;
  name: string;
  roles?: { name: string }[];
}

/**
 * 右上角头像及菜单组件
 * 开发环境下显示用户切换功能
 */
function RightAvatar({
  initialState,
  runtimeConfig,
}: {
  initialState: LayoutInitialState | undefined;
  runtimeConfig: LayoutRuntimeConfig;
}) {
  const [users, setUsers] = useState<UserItem[]>([]);

  useEffect(() => {
    if (isDev) {
      devGetUsers()
        .then((res) => setUsers(res.data))
        .catch(() => {});
    }
  }, []);

  const handleSwitchUser = async (userId: number) => {
    try {
      const result = await devSwitchUser(userId);
      if (result.success && result.token) {
        localStorage.setItem(TOKEN_KEY, result.token);
        window.location.reload();
      }
    } catch (error) {
      console.error('切换用户失败:', error);
    }
  };

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

  // 开发环境：在退出登录上方插入切换用户子菜单
  if (isDev && users.length > 0) {
    menuItems.unshift({
      key: 'switch-user',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <SwapOutlined />
          切换用户
          <Tag color="orange" style={{ marginLeft: 4, fontSize: 10, lineHeight: '14px' }}>
            dev
          </Tag>
        </span>
      ),
      children: users.map((u) => ({
        key: `switch-${u.id}`,
        label: (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>{u.name}</span>
            {u.roles && u.roles.length > 0 && (
              <Tag style={{ fontSize: 11, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                {u.roles.map((r) => r.name).join(', ')}
              </Tag>
            )}
          </span>
        ),
        onClick: () => handleSwitchUser(u.id),
      })),
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
    _setInitialState: unknown,
    runtimeConfig: LayoutRuntimeConfig,
  ) => (
    <RightAvatar
      initialState={initialState}
      runtimeConfig={runtimeConfig}
    />
  ),
});

export function onRouteChange({ location }: { location: { pathname: string } }) {
  console.log('[App] 路由变化:', location.pathname);
}
