/**
 * 查看权限配置矩阵组件
 * @module pages/Oa/FormConfig/components/ViewPermissionMatrix
 *
 * 展示字段 × 环节的查看权限矩阵表格，管理员可点击单元格切换权限状态。
 * 与 FieldPermissionMatrix 的区别：
 * - 权限状态仅 2 态：只读 / 隐藏（无"可编辑"）
 * - 独立保存按钮，调用 view-permissions 接口
 */
import React from 'react';
import { Table, Tag, Button, Card, Typography, Dropdown } from 'antd';
import { SaveOutlined, DownOutlined } from '@ant-design/icons';
import type { FormField, WorkflowDef, ViewPermissionsOverride } from '@/types/oa';
import { useViewPermissions, VIEW_PERMISSION_LABELS } from '../hooks/useViewPermissions';

const { Text } = Typography;

interface ViewPermissionMatrixProps {
  formCode: string;
  fields: FormField[];
  workflowNodes: WorkflowDef['nodes'];
  initialViewPermissions?: ViewPermissionsOverride;
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

const ViewPermissionMatrix: React.FC<ViewPermissionMatrixProps> = ({
  formCode,
  fields,
  workflowNodes,
  initialViewPermissions,
}) => {
  const { togglePermission, getPermission, setAllFieldsPermission, savePermissions, saving } =
    useViewPermissions(formCode, initialViewPermissions);

  const userFields = fields.filter(isUserField);
  const flatFields = flattenFieldsWithChildren(userFields);

  // 过滤出非 auto/cc 类型的节点
  const humanNodes = workflowNodes.filter(n => n.type !== 'auto' && n.type !== 'cc');

  // 所有用户可见字段的 key 列表（用于批量设置）
  const allFieldKeys = flatFields.map(f => f.field.key);

  /** 生成列头批量操作菜单 */
  const renderColumnTitle = (nodeOrder: string, title: string) => {
    const menuItems = [
      { key: 'readonly', label: '全部只读', onClick: () => setAllFieldsPermission(nodeOrder, allFieldKeys, 'readonly') },
      { key: 'hidden', label: '全部隐藏', onClick: () => setAllFieldsPermission(nodeOrder, allFieldKeys, 'hidden') },
    ];
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span>{title}</span>
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <DownOutlined style={{ fontSize: 10, cursor: 'pointer', color: '#999' }} />
        </Dropdown>
      </div>
    );
  };

  const columns = [
    {
      title: '字段名称',
      dataIndex: ['field', 'label'],
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
      title: renderColumnTitle('0', '发起阶段（发起人）'),
      key: 'node_0',
      width: 120,
      align: 'center' as const,
      render: (_: unknown, record: { field: FormField }) => {
        const perm = getPermission('0', record.field.key);
        const meta = perm ? VIEW_PERMISSION_LABELS[perm] : VIEW_PERMISSION_LABELS.hidden;
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
    ...humanNodes.map(node => ({
      title: renderColumnTitle(String(node.order), node.name),
      key: `node_${node.order}`,
      width: 100,
      align: 'center' as const,
      render: (_: unknown, record: { field: FormField }) => {
        const perm = getPermission(String(node.order), record.field.key);
        const meta = perm ? VIEW_PERMISSION_LABELS[perm] : VIEW_PERMISSION_LABELS.hidden;
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
      title="查看权限配置"
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
          保存查看权限
        </Button>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        非办理人查看详情时使用。点击单元格切换状态：只读 → 隐藏。未配置的字段默认全部隐藏。
      </Text>
      <Table
        dataSource={flatFields}
        columns={columns}
        rowKey={(record) => record.field.key}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 180 + 120 + 100 * humanNodes.length }}
      />
    </Card>
  );
};

export default ViewPermissionMatrix;
