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

/** 展开表格子字段：将 table 类型的子字段插入到父字段后面作为子行 */
function flattenFieldsWithChildren(fields: FormField[]): Array<{ field: FormField; isChild: boolean; parentKey?: string }> {
  const result: Array<{ field: FormField; isChild: boolean; parentKey?: string }> = [];
  for (const field of fields) {
    result.push({ field, isChild: false });
    // 表格类型且有子字段时，展开子字段
    if (field.type === 'table' && field.children) {
      for (const child of field.children) {
        if (!child.hidden) {
          result.push({
            field: { ...child, key: `${field.key}.${child.key}`, label: `  └ ${child.label}` },
            isChild: true,
            parentKey: field.key,
          });
        }
      }
    }
  }
  return result;
}

const FieldPermissionMatrix: React.FC<FieldPermissionMatrixProps> = ({
  formCode,
  fields,
  workflowNodes,
  initialPermissions,
}) => {
  const { togglePermission, getPermission, savePermissions, saving } =
    useFieldPermissions(formCode, initialPermissions);

  // 过滤出用户可见字段，并展开表格子字段
  const userFields = fields.filter(isUserField);
  const flatFields = flattenFieldsWithChildren(userFields);

  // 过滤出非 auto/cc 类型的节点（auto 和 cc 节点不需要字段权限配置）
  const humanNodes = workflowNodes.filter(n => n.type !== 'auto' && n.type !== 'cc');

  // 构建表格列
  const columns = [
    {
      title: '字段名称',
      dataIndex: 'label',
      key: 'label',
      width: 180,
      fixed: 'left' as const,
      render: (label: string, record: { field: FormField; isChild: boolean }) => (
        <Text strong={!record.isChild} style={{ fontSize: 13, color: record.isChild ? '#666' : undefined, paddingLeft: record.isChild ? 16 : 0 }}>
          {label}
        </Text>
      ),
    },
    {
      title: '发起阶段',
      key: 'node_0',
      width: 100,
      align: 'center' as const,
      render: (_: unknown, record: { field: FormField }) => {
        const perm = getPermission('0', record.field.key);
        const meta = perm ? PERMISSION_LABELS[perm] : PERMISSION_LABELS.hidden;
        return (
          <Tag
            color={meta.color}
            style={{ cursor: 'pointer', userSelect: 'none', minWidth: 56, textAlign: 'center' }}
            onClick={() => togglePermission('0', record.field.key)}
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
      render: (_: unknown, record: { field: FormField }) => {
        const perm = getPermission(String(node.order), record.field.key);
        const meta = perm ? PERMISSION_LABELS[perm] : PERMISSION_LABELS.hidden;
        return (
          <Tag
            color={meta.color}
            style={{ cursor: 'pointer', userSelect: 'none', minWidth: 56, textAlign: 'center' }}
            onClick={() => togglePermission(String(node.order), record.field.key)}
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
        点击单元格切换状态：可编辑 → 只读 → 隐藏。每个环节必须配置所有字段的权限，不允许留空。
      </Text>
      <Table
        dataSource={flatFields}
        columns={columns}
        rowKey={(record) => record.field.key}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 180 + 100 * (1 + humanNodes.length) }}
      />
    </Card>
  );
};

export default FieldPermissionMatrix;
