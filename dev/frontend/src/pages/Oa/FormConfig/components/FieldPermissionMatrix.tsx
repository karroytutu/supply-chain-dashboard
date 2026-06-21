/**
 * 字段权限配置矩阵组件
 * @module pages/Oa/FormConfig/components/FieldPermissionMatrix
 *
 * 展示字段 × 环节的权限矩阵表格，管理员可点击单元格切换权限状态。
 * 支持发起阶段和审批/办理节点的字段权限配置。
 */
import React from 'react';
import { Table, Tag, Button, Card, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { FormField, WorkflowDef, FieldPermissionsOverride } from '@/types/oa';
import { useFieldPermissions, PERMISSION_LABELS } from '../hooks/useFieldPermissions';

const { Text } = Typography;

interface FieldPermissionMatrixProps {
  formCode: string;
  fields: FormField[];
  workflowNodes: WorkflowDef['nodes'];
  initialPermissions?: FieldPermissionsOverride;
}

/** 需要过滤的字段：_ 前缀内部字段和 hidden 字段 */
function isUserField(field: FormField): boolean {
  return !field.key.startsWith('_') && !field.hidden;
}

const FieldPermissionMatrix: React.FC<FieldPermissionMatrixProps> = ({
  formCode,
  fields,
  workflowNodes,
  initialPermissions,
}) => {
  const { togglePermission, getPermission, savePermissions, saving } =
    useFieldPermissions(formCode, initialPermissions);

  // 过滤出用户可见字段
  const userFields = fields.filter(isUserField);

  // 过滤出非 auto 类型的节点（auto 节点不需要字段权限配置）
  const humanNodes = workflowNodes.filter(n => n.type !== 'auto');

  // 构建表格列
  const columns = [
    {
      title: '字段名称',
      dataIndex: 'label',
      key: 'label',
      width: 140,
      fixed: 'left' as const,
      render: (label: string, record: FormField) => (
        <Text strong style={{ fontSize: 13 }}>{label}</Text>
      ),
    },
    {
      title: '发起阶段',
      key: 'initiation',
      width: 100,
      align: 'center' as const,
      render: (_: unknown, record: FormField) => {
        const perm = getPermission('initiation', '', record.key);
        const meta = perm ? PERMISSION_LABELS[perm] : PERMISSION_LABELS.default;
        return (
          <Tag
            color={meta.color}
            style={{ cursor: 'pointer', userSelect: 'none', minWidth: 56, textAlign: 'center' }}
            onClick={() => togglePermission('initiation', '', record.key)}
          >
            {meta.label}
          </Tag>
        );
      },
    },
    // 每个审批/办理节点一列
    ...humanNodes.map(node => ({
      title: node.name,
      key: `node_${node.order}`,
      width: 100,
      align: 'center' as const,
      render: (_: unknown, record: FormField) => {
        const perm = getPermission('nodes', String(node.order), record.key);
        const meta = perm ? PERMISSION_LABELS[perm] : PERMISSION_LABELS.default;
        return (
          <Tag
            color={meta.color}
            style={{ cursor: 'pointer', userSelect: 'none', minWidth: 56, textAlign: 'center' }}
            onClick={() => togglePermission('nodes', String(node.order), record.key)}
          >
            {meta.label}
          </Tag>
        );
      },
    })),
  ];

  return (
    <Card
      title="字段权限配置"
      size="small"
      style={{ marginTop: 16 }}
      extra={
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={savePermissions}
          size="small"
        >
          保存字段权限
        </Button>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        点击单元格切换状态：默认(继承) → 可编辑 → 只读 → 隐藏。
        "默认"表示使用代码定义的权限，不写入数据库覆盖。
      </Text>
      <Table
        dataSource={userFields}
        columns={columns}
        rowKey="key"
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 140 + 100 * (1 + humanNodes.length) }}
      />
    </Card>
  );
};

export default FieldPermissionMatrix;
