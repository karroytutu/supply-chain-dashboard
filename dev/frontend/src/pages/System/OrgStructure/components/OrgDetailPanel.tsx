import { Card, Table, Avatar, Tag, Spin, Typography, List, Empty } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { DeptUserItem, UserBrief } from '@/services/api/org';
import type { SelectedInfo } from '../types';

const { Text } = Typography;

interface OrgDetailPanelProps {
  selected: SelectedInfo;
  deptUsers: DeptUserItem[];
  deptUsersLoading: boolean;
  supervisor: UserBrief | null;
  subordinates: UserBrief[];
  userDetailLoading: boolean;
  onSelectUser: (userId: number, name: string) => void;
}

export default function OrgDetailPanel({
  selected,
  deptUsers,
  deptUsersLoading,
  supervisor,
  subordinates,
  userDetailLoading,
  onSelectUser,
}: OrgDetailPanelProps) {
  if (!selected) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        请在左侧选择部门或用户
      </div>
    );
  }

  // 选中部门 → 显示部门用户表格
  if (selected.type === 'dept') {
    const columns = [
      {
        title: '姓名',
        dataIndex: 'name',
        key: 'name',
        render: (name: string, record: DeptUserItem) => (
          <a onClick={() => onSelectUser(record.id, name)}>
            <Avatar size="small" src={record.avatar} icon={<UserOutlined />} style={{ marginRight: 8 }} />
            {name}
          </a>
        ),
      },
      { title: '职位', dataIndex: 'position', key: 'position' },
      {
        title: '主部门',
        key: 'isPrimary',
        render: (_: any, record: DeptUserItem) =>
          record.isPrimary ? <Tag color="blue">主部门</Tag> : null,
      },
      {
        title: '负责人',
        key: 'isLeader',
        render: (_: any, record: DeptUserItem) =>
          record.isLeader ? <Tag color="orange">负责人</Tag> : null,
      },
      {
        title: '角色',
        key: 'roles',
        render: (_: any, record: DeptUserItem) =>
          record.roles.map(r => <Tag key={r.code}>{r.name}</Tag>),
      },
    ];

    return (
      <Card title={selected.name}>
        <Table
          columns={columns}
          dataSource={deptUsers}
          rowKey="id"
          loading={deptUsersLoading}
          pagination={false}
          size="small"
        />
      </Card>
    );
  }

  // 选中用户 → 显示用户详情（上级 + 下属）
  const currentUser = deptUsers.find(u => u.id === selected.userId);

  return (
    <Spin spinning={userDetailLoading}>
      {/* 用户基本信息 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar size={64} src={currentUser?.avatar} icon={<UserOutlined />} />
          <div>
            <Text strong style={{ fontSize: 18 }}>{selected.name}</Text>
            <div><Text type="secondary">{currentUser?.position || ''}</Text></div>
            <div><Text type="secondary">{currentUser?.departmentName || ''}</Text></div>
          </div>
        </div>
      </Card>

      {/* 直属上级 */}
      <Card title="直属上级" size="small" style={{ marginBottom: 16 }}>
        {supervisor ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            onClick={() => onSelectUser(supervisor.id, supervisor.name)}
          >
            <Avatar src={supervisor.avatar} icon={<UserOutlined />} />
            <div>
              <a>{supervisor.name}</a>
              <div><Text type="secondary">{supervisor.position}</Text></div>
              <div><Text type="secondary">{supervisor.departmentName}</Text></div>
            </div>
          </div>
        ) : (
          <Empty description="未设置直属主管" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* 直属下属 */}
      <Card title={`直属下属 (${subordinates.length})`} size="small">
        {subordinates.length > 0 ? (
          <List
            size="small"
            dataSource={subordinates}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '8px 0' }}
                onClick={() => onSelectUser(item.id, item.name)}
              >
                <List.Item.Meta
                  avatar={<Avatar size="small" src={item.avatar} icon={<UserOutlined />} />}
                  title={<a>{item.name}</a>}
                  description={`${item.position || ''} · ${item.departmentName || ''}`}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无下属" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>
    </Spin>
  );
}