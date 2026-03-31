/**
 * 用户表格组件
 */
import React from 'react';
import { Table, Space, Tag, Badge, Button, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { UserSwitchOutlined, StopOutlined, CheckOutlined } from '@ant-design/icons';
import type { UserItem } from '../types';

interface UserTableProps {
  dataSource: UserItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  selectedRowKeys: number[];
  onPageChange: (page: number, pageSize: number) => void;
  onSelectedRowKeysChange: (keys: number[]) => void;
  onAssignRoles: (user: UserItem) => void;
  onToggleStatus: (user: UserItem) => Promise<boolean>;
}

const UserTable: React.FC<UserTableProps> = ({
  dataSource,
  loading,
  total,
  page,
  pageSize,
  selectedRowKeys,
  onPageChange,
  onSelectedRowKeysChange,
  onAssignRoles,
  onToggleStatus,
}) => {
  const columns: ColumnsType<UserItem> = [
    {
      title: '用户',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text: string, record: UserItem) => (
        <Space>
          <img
            src={record.avatar || 'https://gw.alipayobjects.com/zos/antfincdn/efFD%24DOqi%26/no-trans-svg.svg'}
            alt=""
            style={{ width: 32, height: 32, borderRadius: '50%' }}
          />
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'mobile',
      key: 'mobile',
      width: 130,
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 120,
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 200,
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
      width: 80,
      render: (status: number) => (
        <Badge
          status={status === 1 ? 'success' : 'error'}
          text={status === 1 ? '正常' : '禁用'}
        />
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 170,
      render: (text: string) => text ? new Date(text).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: UserItem) => (
        <Space>
          <Button
            type="link"
            icon={<UserSwitchOutlined />}
            onClick={() => onAssignRoles(record)}
          >
            分配角色
          </Button>
          {record.status === 1 ? (
            <Popconfirm
              title="确认禁用用户"
              description="禁用后该用户将无法登录系统，确定要禁用吗？"
              onConfirm={() => onToggleStatus(record)}
              okText="确认禁用"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" danger icon={<StopOutlined />}>
                禁用
              </Button>
            </Popconfirm>
          ) : (
            <Button
              type="link"
              icon={<CheckOutlined />}
              onClick={() => onToggleStatus(record)}
            >
              启用
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const handleTableChange = (pagination: TablePaginationConfig) => {
    onPageChange(pagination.current || 1, pagination.pageSize || 10);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      onSelectedRowKeysChange(keys as number[]);
    },
  };

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      rowSelection={rowSelection}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
        pageSizeOptions: ['10', '20', '50'],
      }}
      onChange={handleTableChange}
      scroll={{ x: 1200 }}
    />
  );
};

export { UserTable };
export default UserTable;
