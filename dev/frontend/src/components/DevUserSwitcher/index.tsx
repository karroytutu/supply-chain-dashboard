import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Popover, Input, Spin, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { devGetUsers, devSwitchUser, getCurrentUser, type UserInfo } from '@/services/api/auth';
import { useModel } from 'umi';
import './index.less';

const TOKEN_KEY = 'auth_token';

interface UserItem {
  id: number;
  name: string;
  avatar?: string;
  roles?: { name: string }[];
}

interface DevUserSwitcherProps {
  children: React.ReactNode;
  onSwitch: (name: string, avatar: string) => void;
}

function getUserGroup(user: UserItem): string {
  if (!user.roles || user.roles.length === 0) return '未分组';
  return user.roles[0].name;
}

function groupUsers(users: UserItem[]): { group: string; users: UserItem[] }[] {
  const map = new Map<string, UserItem[]>();
  users.forEach((u) => {
    const group = getUserGroup(u);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(u);
  });

  const order = ['管理员', '系统管理', '运营', '财务', '采购', '仓储', '营销'];
  const result: { group: string; users: UserItem[] }[] = [];
  order.forEach((g) => {
    if (map.has(g)) {
      result.push({ group: g, users: map.get(g)! });
      map.delete(g);
    }
  });
  map.forEach((users, group) => result.push({ group, users }));
  return result;
}

/**
 * 开发环境用户切换面板
 *
 * 点击子元素后弹出搜索面板，支持按角色分组浏览和搜索过滤用户。
 * 切换用户后无感刷新权限状态，不触发页面 reload。
 */
const DevUserSwitcher: React.FC<DevUserSwitcherProps> = ({ children, onSwitch }) => {
  const authModel = useModel('auth');
  const currentUser = authModel?.currentUser as UserInfo | null;
  const setCurrentUser = authModel?.setCurrentUser as ((user: UserInfo | null) => void) | undefined;

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!open || users.length > 0) return;
    setLoading(true);
    devGetUsers()
      .then((res) => setUsers(res.data || []))
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
        if (!result.success || !result.token) {
          message.error(result.message || '切换用户失败');
          return;
        }

        localStorage.setItem(TOKEN_KEY, result.token);
        const newUser = await getCurrentUser();

        if (setCurrentUser) {
          setCurrentUser(newUser);
        }

        onSwitch(newUser.name, newUser.avatar);
        setOpen(false);
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
        <span className="panel-dev-tag">dev</span>
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
