import { useState, useEffect } from 'react';
import { Table, Card, Button, Space, Tag, Modal, message, Form, Input as AntInput, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getPermissionTree, createPermission } from '@/services/api/auth';
import styles from './index.less';

interface PermissionItem {
  id: number;
  code: string;
  name: string;
  resource_type: string;
  resource_key: string;
  action: string;
  parent_id: number | null;
  children?: PermissionItem[];
}

export default function PermissionManage() {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<PermissionItem[]>([]);
  
  // 创建弹窗
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  // 加载权限树
  const loadPermissions = async () => {
    setLoading(true);
    try {
      const result = await getPermissionTree();
      setDataSource(result.data);
    } catch (error) {
      message.error('加载权限列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  // 打开创建弹窗
  const openCreateModal = () => {
    form.resetFields();
    setCreateModalVisible(true);
  };

  // 创建权限
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await createPermission(values);
      message.success('创建成功');
      setCreateModalVisible(false);
      loadPermissions();
    } catch (error: any) {
      message.error(error.message || '创建失败');
    }
  };

  // 将树形数据扁平化展示
  const flattenTree = (items: PermissionItem[], level: number = 0): any[] => {
    let result: any[] = [];
    items.forEach(item => {
      result.push({ ...item, level });
      if (item.children && item.children.length > 0) {
        result = result.concat(flattenTree(item.children, level + 1));
      }
    });
    return result;
  };

  const flattenedData = flattenTree(dataSource);

  const columns = [
    {
      title: '权限名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <span style={{ paddingLeft: record.level * 20 }}>{text}</span>
      ),
    },
    {
      title: '权限编码',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: '资源类型',
      dataIndex: 'resource_type',
      key: 'resource_type',
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          menu: 'green',
          api: 'orange',
          button: 'purple',
        };
        return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
      },
    },
    {
      title: '资源标识',
      dataIndex: 'resource_key',
      key: 'resource_key',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      render: (action: string) => {
        const colorMap: Record<string, string> = {
          read: 'green',
          write: 'orange',
          delete: 'red',
        };
        return <Tag color={colorMap[action] || 'default'}>{action}</Tag>;
      },
    },
  ];

  return (
    <div className={styles.container}>
      <Card>
        <div className={styles.toolbar}>
          <span>权限管理</span>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建权限
          </Button>
        </div>
        
        <Table
          columns={columns}
          dataSource={flattenedData}
          rowKey="id"
          loading={loading}
          pagination={false}
          defaultExpandAllRows
        />
      </Card>

      {/* 创建弹窗 */}
      <Modal
        title="新建权限"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => setCreateModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="code"
            label="权限编码"
            rules={[{ required: true, message: '请输入权限编码' }]}
          >
            <AntInput placeholder="如：system:user:read" />
          </Form.Item>
          <Form.Item
            name="name"
            label="权限名称"
            rules={[{ required: true, message: '请输入权限名称' }]}
          >
            <AntInput placeholder="如：查看用户" />
          </Form.Item>
          <Form.Item
            name="resource_type"
            label="资源类型"
            rules={[{ required: true, message: '请选择资源类型' }]}
          >
            <Select placeholder="选择资源类型">
              <Select.Option value="menu">菜单</Select.Option>
              <Select.Option value="api">API</Select.Option>
              <Select.Option value="button">按钮</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="resource_key"
            label="资源标识"
            rules={[{ required: true, message: '请输入资源标识' }]}
          >
            <AntInput placeholder="如：/system/users" />
          </Form.Item>
          <Form.Item
            name="action"
            label="操作类型"
            rules={[{ required: true, message: '请选择操作类型' }]}
          >
            <Select placeholder="选择操作类型">
              <Select.Option value="read">读取</Select.Option>
              <Select.Option value="write">写入</Select.Option>
              <Select.Option value="delete">删除</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
