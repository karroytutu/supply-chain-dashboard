import React from 'react';
import './styles/global.less';
import { Dropdown, Spin, Tag } from 'antd';
import { LogoutOutlined, SwapOutlined } from '@ant-design/icons';
import { getCurrentUser } from '@/services/api/auth';
import UserAvatar from '@/components/UserAvatar';
import DevUserSwitcher from '@/components/DevUserSwitcher';
import ChunkErrorBoundary from '@/components/ChunkErrorBoundary';
import { initChunkErrorGlobalListener } from '@/utils/chunk-error-handler';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/constants/permissions';

// 在 React 渲染之前注册全局 chunk 加载错误监听
initChunkErrorGlobalListener();

const TOKEN_KEY = 'auth_token';
const isDev = process.env.NODE_ENV === 'development';

interface LayoutInitialState {
  name?: string;
  avatar?: string;
  permissions?: string[];
  roles?: string[];
  /** 认证失败跳转中标记，阻止 access 插件渲染 403 页面 */
  __authRedirecting?: boolean;
}

interface LayoutRuntimeConfig {
  logout?: (state: LayoutInitialState) => void;
}

/**
 * 右上角头像及菜单组件
 * 开发环境或拥有 system:user:switch 权限时显示用户切换功能
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
  const { hasPermission } = usePermission();
  const canSwitchUser = isDev || hasPermission(PERMISSIONS.SYSTEM.USER.SWITCH);

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

  // 开发环境或有权限：在退出登录上方插入切换用户入口（弹出搜索面板）
  if (canSwitchUser) {
    menuItems.unshift({
      key: 'switch-user',
      label: (
        <DevUserSwitcher
          isDev={isDev}
          onSwitch={({ name, avatar, permissions, roles }) => {
            setInitialState((s) => ({ ...s, name, avatar, permissions, roles }));
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <SwapOutlined />
            切换用户
            {isDev ? (
              <Tag color="orange" style={{ marginLeft: 4, fontSize: 10, lineHeight: '14px' }}>
                dev
              </Tag>
            ) : (
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 10, lineHeight: '14px' }}>
                授权
              </Tag>
            )}
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
 * 获取初始状态，供 layout 插件和 access 插件使用
 * 包含用户基本信息和权限数据
 *
 * 认证失败时通过 __authRedirecting 标记阻止 access 插件渲染 403 页面，
 * 避免在 window.location.href 跳转生效前出现空权限中间态
 */
export async function getInitialState() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    // 无令牌时，判断当前是否已在登录相关页面
    const pathname = window.location.pathname;
    const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');
    if (isLoginPage) {
      // 已在登录页，不需要再次跳转，返回空状态
      return { name: '', avatar: '', permissions: [], roles: [] };
    }
    // 不在登录页，跳转登录页，返回 redirecting 标记阻止 403 渲染
    window.location.href = '/login';
    return { name: '', avatar: '', permissions: [], roles: [], __authRedirecting: true };
  }

  try {
    const user = await getCurrentUser();
    return {
      name: user.name,
      avatar: user.avatar,
      permissions: user.permissions || [],
      roles: user.roles?.map(r => r.code) || [],
    };
  } catch (error: any) {
    // 基于 HTTP 状态码判断认证错误（替代关键词匹配，更可靠）
    if (error?.status === 401 || error?.status === 403) {
      console.warn('[App] 认证失败，跳转登录页:', error?.message);
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return { name: '', avatar: '', permissions: [], roles: [], __authRedirecting: true };
    }

    // 网络/临时错误 → 重试一次
    console.warn('[App] 获取用户信息失败，重试中:', error?.message);
    try {
      const user = await getCurrentUser();
      return {
        name: user.name,
        avatar: user.avatar,
        permissions: user.permissions || [],
        roles: user.roles?.map(r => r.code) || [],
      };
    } catch (retryError: any) {
      console.error('[App] 重试获取用户信息仍失败:', retryError?.message);
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return { name: '', avatar: '', permissions: [], roles: [], __authRedirecting: true };
    }
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

/**
 * 用 ChunkErrorBoundary 包裹整个应用
 * 捕获 React.lazy() 动态导入的 chunk 加载失败错误，自动刷新恢复
 */
export function rootContainer(container: React.ReactElement): React.ReactElement {
  return React.createElement(ChunkErrorBoundary, null, container);
}
