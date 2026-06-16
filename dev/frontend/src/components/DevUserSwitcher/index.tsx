import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Popover, Input, Spin, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { devGetUsers, devSwitchUser, getCurrentUser, type UserInfo, type DevUserItem } from '@/services/api/auth';
import { useModel, history } from 'umi';
import './index.less';

const TOKEN_KEY = 'auth_token';

interface SwitchPayload {
  name: string;
  avatar: string;
  permissions: string[];
  roles: string[];
}

interface DevUserSwitcherProps {
  children: React.ReactNode;
  onSwitch: (payload: SwitchPayload) => void;
  /** 是否为开发环境（影响面板标签显示） */
  isDev?: boolean;
}

function groupUsers(users: DevUserItem[]): { group: string; users: DevUserItem[] }[] {
  const map = new Map<string, DevUserItem[]>();
  users.forEach((u) => {
    if (!u.roles || u.roles.length === 0) {
      const group = '未分组';
      if (!map.has(group)) map.set(group, []);
      (map.get(group) as DevUserItem[]).push(u);
    } else {
      u.roles.forEach(r => {
        if (!map.has(r.name)) map.set(r.name, []);
        (map.get(r.name) as DevUserItem[]).push(u);
      });
    }
  });

  const order = ['管理员', '系统管理', '运营', '财务', '采购', '仓储', '营销'];
  const result: { group: string; users: DevUserItem[] }[] = [];
  order.forEach((g) => {
    if (map.has(g)) {
      result.push({ group: g, users: map.get(g) as DevUserItem[] });
      map.delete(g);
    }
  });
  map.forEach((groupUsers, group) => result.push({ group, users: groupUsers }));
  return result;
}

/**
 * 用户切换面板
 *
 * 点击子元素后弹出搜索面板，支持按角色分组浏览和搜索过滤用户。
 * 切换用户后无感刷新权限状态，不触发页面 reload。
 * 开发环境免权限使用，生产环境需 system:user:switch 权限。
 */
const DevUserSwitcher: React.FC<DevUserSwitcherProps> = ({ children, onSwitch, isDev = false }) => {
  const authModel = useModel('auth');
  const currentUser = authModel?.currentUser as UserInfo | null;
  const setCurrentUser = authModel?.setCurrentUser as ((user: UserInfo | null) => void) | undefined;

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DevUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!open || users.length > 0) return;
    setLoading(true);
    devGetUsers()
      .then((userList) => setUsers(userList || []))
      .catch(() => message.error('获取用户列表失败'))
      .finally(() => setLoading(false));
  }, [open, users.length]);

  useEffect(() => {
    if (open) setSearchText('');
  }, [open]);

  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) return users;
    const q = searchText.trim().toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.roles?.some((r) => r.name.toLowerCase().includes(q)),
    );
  }, [users, searchText]);

  const grouped = useMemo(() => groupUsers(filteredUsers), [filteredUsers]);

  const handleSwitch = useCallback(
    async (userId: number) => {
      if (userId === currentUser?.id || switchingId !== null) return;

      setSwitchingId(userId);
      try {
        const result = await devSwitchUser(userId);
        if (!result.token) {
          message.error(result.message || '切换用户失败');
          return;
        }

        localStorage.setItem(TOKEN_KEY, result.token);
        const newUser = await getCurrentUser();

        if (setCurrentUser) {
          setCurrentUser(newUser);
        }

        onSwitch({
          name: newUser.name,
          avatar: newUser.avatar,
          permissions: newUser.permissions || [],
          roles: newUser.roles?.map(r => r.code) || [],
        });
        setOpen(false);
        history.push('/');
        message.success(`已切换为 ${newUser.name}`);
      } catch (error) {
        message.error('切换用户失败');
      } finally {
        setSwitchingId(null);
      }
    },
    [currentUser?.id, switchingId, setCurrentUser, onSwitch],
  );

  const content = (
    <div className="dev-user-switcher-panel">
      <div className="panel-header">
        <span className="panel-title">切换用户</span>
        {isDev ? (
          <span className="panel-dev-tag">dev</span>
        ) : (
          <span className="panel-auth-tag">授权</span>
        )}
      </div>
      <div className="panel-search">
        <Input
          size="small"
          placeholder="搜索用户或角色"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          autoFocus
        />
      </div>
      <div className="panel-body">
        {loading ? (
          <div className="panel-loading">
            <Spin size="small" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="panel-empty">未找到匹配的用户</div>
        ) : (
          grouped.map(({ group, users: groupUsers }) => (
            <div key={group} className="panel-group">
              <div className="panel-group-label">
                {group} ({groupUsers.length})
              </div>
              {groupUsers.map((u) => {
                const isActive = u.id === currentUser?.id;
                const isSwitching = u.id === switchingId;
                return (
                  <div
                    key={u.id}
                    className={`panel-user-item ${isActive ? 'active' : ''} ${isSwitching ? 'switching' : ''}`}
                    onClick={() => handleSwitch(u.id)}
                  >
                    <div className="panel-user-avatar">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} />
                      ) : (
                        u.name[0]
                      )}
                    </div>
                    <div className="panel-user-info">
                      <div className="panel-user-name">{u.name}</div>
                      <div className="panel-user-role">
                        {u.roles?.map((r) => r.name).join('、') || '无角色'}
                      </div>
                    </div>
                    <div className="panel-user-check">{isActive && '✓'}</div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="panel-footer">点击用户即可切换，权限即时生效</div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={content}
      placement="bottomRight"
      trigger="click"
      overlayClassName="dev-user-switcher-popover"
    >
      {children}
    </Popover>
  );
};

export default DevUserSwitcher;
