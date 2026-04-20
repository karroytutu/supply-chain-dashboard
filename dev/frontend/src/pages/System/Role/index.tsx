/**
 * 角色管理页面
 */
import { useState, useEffect } from 'react';
import { Card, Button, Input, Space, Modal, message, Form, Input as AntInput } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { getRoleList, createRole, updateRole, deleteRole, getPermissionTree } from '@/services/api/auth';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS, ROLES } from '@/constants/permissions';
import { usePermission } from '@/hooks/usePermission';
import RoleTable from './components/RoleTable';
import PermissionAssignModal from './components/PermissionAssignModal';
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
  const { hasRole } = usePermission();
  const isAdmin = hasRole(ROLES.ADMIN);
  
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<RoleItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  // 编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleItem | null>(null);

  // 权限分配弹窗
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);
  const [permissionTree, setPermissionTree] = useState<PermissionItem[]>([]);

  // 加载角色列表
  const loadRoles = async () => {
    setLoading(true);
    try {
      const result = await getRoleList({ page: 1, pageSize: 100, keyword });
      setDataSource(result.data);
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
      setPermissionTree(result);
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    loadRoles();
    loadPermissionTree();
  }, []);

  // 搜索
  const handleSearch = () => {
    loadRoles();
  };

  // 打开创建弹窗
  const openCreateModal = () => {
    setCurrentRole(null);
    form.resetFields();
    setEditModalVisible(true);
  };

  // 打开编辑弹窗
  const openEditModal = (role: RoleItem) => {
    setCurrentRole(role);
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

      if (currentRole) {
        await updateRole(currentRole.id, values);
        message.success('更新成功');
      } else {
        await createRole({ code: values.code, ...values });
        message.success('创建成功');
      }

      setEditModalVisible(false);
      loadRoles();
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  };

  // 删除角色
  const handleDelete = async (role: RoleItem) => {
    try {
      await deleteRole(role.id);
      message.success('删除成功');
      loadRoles();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  // 打开权限分配弹窗
  const openPermissionModal = (role: RoleItem) => {
    setSelectedRole(role);
    setPermissionModalVisible(true);
  };

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
              allowClear
            />
            <Button type="primary" onClick={handleSearch}>
              搜索
            </Button>
          </Space>
          {isAdmin && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建角色
            </Button>
          )}
        </div>

        <RoleTable
          dataSource={dataSource}
          loading={loading}
          onAssignPermission={openPermissionModal}
          onEdit={openEditModal}
          onDelete={handleDelete}
        />
      </Card>

      {/* 编辑/创建弹窗 */}
      <Modal
        title={currentRole ? '编辑角色' : '新建角色'}
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => setEditModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          {!currentRole && (
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

      {/* 权限分配弹窗 */}
      <PermissionAssignModal
        visible={permissionModalVisible}
        role={selectedRole}
        permissionTree={permissionTree}
        onClose={() => setPermissionModalVisible(false)}
        onSuccess={loadRoles}
      />
    </div>
  );
}
