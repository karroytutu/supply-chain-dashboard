/**
 * 权限表格组件 - 树形展示
 */
import React from 'react';
import { Table, Tag, Space } from 'antd';
import {
  AppstoreOutlined,
  MenuOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

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

interface PermissionTableProps {
  dataSource: PermissionItem[];
  loading: boolean;
}

// 资源类型颜色映射
const resourceTypeColorMap: Record<string, string> = {
  menu: 'green',
  api: 'orange',
  button: 'purple',
};

// 操作类型颜色映射
const actionColorMap: Record<string, string> = {
  read: 'green',
  write: 'orange',
  delete: 'red',
  confirm: 'blue',
};

// 层级图标组件
const LevelIcon: React.FC<{ resourceType: string; hasChildren: boolean }> = ({
  resourceType,
  hasChildren,
}) => {
  if (hasChildren) {
    if (resourceType === 'menu') {
      return <AppstoreOutlined style={{ color: '#1890ff', marginRight: 8 }} />;
    }
    return <MenuOutlined style={{ color: '#52c41a', marginRight: 8 }} />;
  }
  return <KeyOutlined style={{ color: '#722ed1', marginRight: 8 }} />;
};

const PermissionTable: React.FC<PermissionTableProps> = ({ dataSource, loading }) => {
  const columns: ColumnsType<PermissionItem> = [
    {
      title: '权限名称',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      render: (text: string, record: PermissionItem) => (
        <Space>
          <LevelIcon
            resourceType={record.resource_type}
            hasChildren={!!record.children?.length}
          />
          <span style={{ fontWeight: record.children?.length ? 600 : 400 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: '权限编码',
      dataIndex: 'code',
      key: 'code',
      width: 200,
      render: (code: string) => (
        <code style={{ fontSize: 12, color: '#1890ff', background: '#f0f5ff', padding: '2px 6px', borderRadius: 4 }}>
          {code}
        </code>
      ),
    },
    {
      title: '资源类型',
      dataIndex: 'resource_type',
      key: 'resource_type',
      width: 100,
      render: (type: string) => (
        <Tag color={resourceTypeColorMap[type] || 'default'}>
          {type === 'menu' ? '菜单' : type === 'api' ? 'API' : '按钮'}
        </Tag>
      ),
    },
    {
      title: '资源标识',
      dataIndex: 'resource_key',
      key: 'resource_key',
      ellipsis: true,
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => {
        if (!action) return '-';
        const actionLabels: Record<string, string> = {
          read: '读取',
          write: '写入',
          delete: '删除',
          confirm: '确认',
        };
        return (
          <Tag color={actionColorMap[action] || 'default'}>
            {actionLabels[action] || action}
          </Tag>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      pagination={false}
      indentSize={20}
      defaultExpandAllRows={false}
      scroll={{ x: 800 }}
    />
  );
};

export default PermissionTable;
