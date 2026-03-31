/**
 * 角色表格组件
 */
import React from 'react';
import { Table, Button, Space, Tag, Badge, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  status: number;
  permissions: { id: number; code: string; name: string }[];
}

interface RoleTableProps {
  dataSource: RoleItem[];
  loading: boolean;
  onAssignPermission: (role: RoleItem) => void;
  onEdit: (role: RoleItem) => void;
  onDelete: (role: RoleItem) => void;
}

const RoleTable: React.FC<RoleTableProps> = ({
  dataSource,
  loading,
  onAssignPermission,
  onEdit,
  onDelete,
}) => {
  const columns: ColumnsType<RoleItem> = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      width: 150,
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'is_system',
      key: 'is_system',
      width: 100,
      render: (isSystem: boolean) => (
        <Tag color={isSystem ? 'red' : 'blue'}>{isSystem ? '系统角色' : '自定义'}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: number) => (
        <Badge status={status === 1 ? 'success' : 'error'} text={status === 1 ? '正常' : '禁用'} />
      ),
    },
    {
      title: '权限数量',
      key: 'permissionCount',
      width: 100,
      render: (_: any, record: RoleItem) => (
        <Tag color="green">{record.permissions?.length || 0}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_: any, record: RoleItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => onAssignPermission(record)}>
            分配权限
          </Button>
          <Button type="link" size="small" onClick={() => onEdit(record)}>
            编辑
          </Button>
          {!record.is_system && (
            <Popconfirm
              title="确认删除"
              description={`确定要删除角色 "${record.name}" 吗？`}
              onConfirm={() => onDelete(record)}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" danger size="small">
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 900 }}
      pagination={{
        showSizeChanger: true,
        showTotal: total => `共 ${total} 条`,
      }}
    />
  );
};

export default RoleTable;
