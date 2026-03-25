import { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Tag, Modal, message, Form, Input as AntInput, Tree, Badge } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { getRoleList, createRole, updateRole, deleteRole, getPermissionTree, assignRolePermissions } from '@/services/api/auth';
import styles from './index.less';

interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  status: number;
  permissions: { id: number; code: string; name: string }[];
}

interface PermissionItem {
  id: number;
  code: string;
  name: string;
  children?: PermissionItem[];
}

export default function RoleManage() {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<RoleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  
  // 编辑/创建弹窗
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<RoleItem | null>(null);
  const [form] = Form.useForm();
  
  // 分配权限弹窗
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleItem | null>(null);
  const [permissionTree, setPermissionTree] = useState<PermissionItem[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);

  // 加载角色列表
  const loadRoles = async () => {
    setLoading(true);
    try {
      const result = await getRoleList({ page, pageSize, keyword });
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载权限树
  const loadPermissionTree = async () => {
    try {
      const result = await getPermissionTree();
      setPermissionTree(result.data);
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    loadRoles();
    loadPermissionTree();
  }, [page, pageSize]);

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadRoles();
  };

  // 打开创建弹窗
  const openCreateModal = () => {
    setCurrentUser(null);
    form.resetFields();
    setEditModalVisible(true);
  };

  // 打开编辑弹窗
  const openEditModal = (role: RoleItem) => {
    setCurrentUser(role);
    form.setFieldsValue({
      name: role.name,
      description: role.description,
    });
    setEditModalVisible(true);
  };

  // 保存角色
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (currentUser) {
        await updateRole(currentUser.id, values);
        message.success('更新成功');
      } else {
        await createRole({ code: values.code, ...values });
        message.success('创建成功');
      }
      
      setEditModalVisible(false);
      loadRoles();
    } catch (error) {
      message.error('保存失败');
    }
  };

  // 删除角色
  const handleDelete = (role: RoleItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除角色 "${role.name}" 吗？`,
      onOk: async () => {
        try {
          await deleteRole(role.id);
          message.success('删除成功');
          loadRoles();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  // 打开分配权限弹窗
  const openPermissionModal = (role: RoleItem) => {
    setCurrentRole(role);
    setCheckedKeys(role.permissions?.map(p => p.id) || []);
    setPermissionModalVisible(true);
  };

  // 分配权限
  const handleAssignPermissions = async () => {
    if (!currentRole) return;
    
    try {
      await assignRolePermissions(currentRole.id, checkedKeys);
      message.success('权限分配成功');
      setPermissionModalVisible(false);
      loadRoles();
    } catch (error) {
      message.error('分配失败');
    }
  };

  // 转换权限树为Antd Tree格式
  const convertToTreeData = (items: PermissionItem[]): any[] => {
    return items.map(item => ({
      key: item.id,
      title: item.name,
      children: item.children ? convertToTreeData(item.children) : [],
    }));
  };

  const columns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '类型',
      dataIndex: 'is_system',
      key: 'is_system',
      render: (isSystem: boolean) => (
        <Tag color={isSystem ? 'red' : 'blue'}>{isSystem ? '系统角色' : '自定义'}</Tag>
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
      title: '权限数量',
      key: 'permissionCount',
      render: (_: any, record: RoleItem) => record.permissions?.length || 0,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: RoleItem) => (
        <Space>
          <Button type="link" onClick={() => openPermissionModal(record)}>
            分配权限
          </Button>
          <Button type="link" onClick={() => openEditModal(record)}>
            编辑
          </Button>
          {!record.is_system && (
            <Button type="link" danger onClick={() => handleDelete(record)}>
              删除
            </Button>
          )}
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
              placeholder="搜索角色名称/编码"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
              prefix={<SearchOutlined />}
            />
            <Button type="primary" onClick={handleSearch}>搜索</Button>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建角色
          </Button>
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

      {/* 编辑/创建弹窗 */}
      <Modal
        title={currentUser ? '编辑角色' : '新建角色'}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => setEditModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          {!currentUser && (
            <Form.Item
              name="code"
              label="角色编码"
              rules={[{ required: true, message: '请输入角色编码' }]}
            >
              <AntInput placeholder="如：manager" />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <AntInput placeholder="如：经理" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <AntInput.TextArea placeholder="角色描述" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 分配权限弹窗 */}
      <Modal
        title={`分配权限 - ${currentRole?.name}`}
        open={permissionModalVisible}
        onOk={handleAssignPermissions}
        onCancel={() => setPermissionModalVisible(false)}
        width={500}
      >
        <Tree
          checkable
          checkedKeys={checkedKeys}
          onCheck={(keys) => setCheckedKeys(keys as number[])}
          treeData={convertToTreeData(permissionTree)}
          defaultExpandAll
        />
      </Modal>
    </div>
  );
}
