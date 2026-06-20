/**
 * 表单管理列表页
 * @module pages/Oa/FormConfig
 */
import React from 'react';
import { Card, Table, Input, Tag, Button, Space } from 'antd';
import { SearchOutlined, EditOutlined } from '@ant-design/icons';
import { history } from 'umi';
import { useFormConfig, type AdminFormType } from './hooks/useFormConfig';

const CATEGORY_LABELS: Record<string, string> = {
  finance: '财务',
  supply_chain: '供应链',
  marketing: '营销',
  hr: '人事',
  admin: '行政',
};

const CATEGORY_COLORS: Record<string, string> = {
  finance: 'gold',
  supply_chain: 'green',
  marketing: 'magenta',
  hr: 'blue',
  admin: 'purple',
};

const FormConfigPage: React.FC = () => {
  const { formTypes, loading, searchText, setSearchText } = useFormConfig();

  const columns = [
    {
      title: '表单名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: AdminFormType) => (
        <Space>
          <span>{name}</span>
          <Tag>{record.code}</Tag>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: string) => (
        <Tag color={CATEGORY_COLORS[cat]}>{CATEGORY_LABELS[cat] || cat}</Tag>
      ),
    },
    {
      title: '节点数',
      key: 'nodeCount',
      width: 100,
      render: (_: unknown, record: AdminFormType) => {
        const nodes = record.workflowDef?.nodes || [];
        const humanNodes = nodes.filter((n) => n.type !== 'auto');
        const autoNodes = nodes.filter((n) => n.type === 'auto');
        return (
          <span>
            {humanNodes.length}
            {autoNodes.length > 0 && <Tag>+{autoNodes.length}自动</Tag>}
          </span>
        );
      },
    },
    {
      title: '可发起岗位',
      key: 'allowedRoles',
      render: (_: unknown, record: AdminFormType) => {
        if (!record.allowedRoles || record.allowedRoles.length === 0) {
          return <Tag color="green">不限制</Tag>;
        }
        return (
          <Space wrap>
            {record.allowedRoles.map((role) => (
              <Tag key={role}>{role}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: AdminFormType) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => history.push(`/oa/form-config/${record.code}`)}
        >
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="表单管理"
      extra={
        <Input
          placeholder="搜索表单名称或编码"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 250 }}
          allowClear
        />
      }
    >
      <Table
        dataSource={formTypes}
        columns={columns}
        rowKey="code"
        loading={loading}
        pagination={false}
        size="middle"
      />
    </Card>
  );
};

export default FormConfigPage;
