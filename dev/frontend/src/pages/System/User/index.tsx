import { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Tag, Modal, message, Drawer, List, Badge } from 'antd';
import { SearchOutlined, UserOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { getUserList, updateUserStatus, getAllRoles, assignUserRoles } from '@/services/api/auth';
import styles from './index.less';

interface UserItem {
  id: number;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  department_name: string;
  position: string;
  status: number;
  last_login_at: string;
  created_at: string;
  roles: { id: number; code: string; name: string }[];
}

export default function UserManage() {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [roles, setRoles] = useState<{ id: number; code: string; name: string }[]>([]);
  
  // 分配角色相关
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);

  // 加载用户列表
  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await getUserList({ page, pageSize, keyword });
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载角色列表
  const loadRoles = async () => {
    try {
      const result = await getAllRoles();
      setRoles(result.data);
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, [page, pageSize]);

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadUsers();
  };

  // 启用/禁用用户
  const handleToggleStatus = async (user: UserItem) => {
    const newStatus = user.status === 1 ? 0 : 1;
    try {
      await updateUserStatus(user.id, newStatus);
      message.success(newStatus === 1 ? '用户已启用' : '用户已禁用');
      loadUsers();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 打开分配角色弹窗
  const openAssignModal = (user: UserItem) => {
    setCurrentUser(user);
    setSelectedRoleIds(user.roles?.map(r => r.id) || []);
    setAssignModalVisible(true);
  };

  // 分配角色
  const handleAssignRoles = async () => {
    if (!currentUser) return;
    
    try {
      await assignUserRoles(currentUser.id, selectedRoleIds);
      message.success('角色分配成功');
      setAssignModalVisible(false);
      loadUsers();
    } catch (error) {
      message.error('分配失败');
    }
  };

  const columns = [
    {
      title: '用户',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: UserItem) => (
        <Space>
          <img src={record.avatar || 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24DOqi%26/no-trans-svg.svg'} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'mobile',
      key: 'mobile',
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: { code: string; name: string }[]) => (
        <Space wrap>
          {roles?.map(role => (
            <Tag key={role.code} color="blue">{role.name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Badge status={status === 1 ? 'success' : 'error'} text={status === 1 ? '正常' : '禁用'} />
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      render: (text: string) => text ? new Date(text).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: UserItem) => (
        <Space>
          <Button type="link" onClick={() => openAssignModal(record)}>
            分配角色
          </Button>
          <Button 
            type="link" 
            danger={record.status === 1}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 1 ? '禁用' : '启用'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <Card>
        <div className={styles.toolbar}>
          <Space>
            <Input
              placeholder="搜索用户名/手机号/邮箱"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
              prefix={<SearchOutlined />}
            />
            <Button type="primary" onClick={handleSearch}>搜索</Button>
          </Space>
        </div>
        
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* 分配角色弹窗 */}
      <Modal
        title={`分配角色 - ${currentUser?.name}`}
        open={assignModalVisible}
        onOk={handleAssignRoles}
        onCancel={() => setAssignModalVisible(false)}
        width={400}
      >
        <List
          dataSource={roles}
          renderItem={role => (
            <List.Item
              onClick={() => {
                if (selectedRoleIds.includes(role.id)) {
                  setSelectedRoleIds(selectedRoleIds.filter(id => id !== role.id));
                } else {
                  setSelectedRoleIds([...selectedRoleIds, role.id]);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <Space>
                {selectedRoleIds.includes(role.id) ? (
                  <CheckCircleOutlined style={{ color: '#1890ff' }} />
                ) : (
                  <span style={{ width: 14 }} />
                )}
                <span>{role.name}</span>
                <Tag>{role.code}</Tag>
              </Space>
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
