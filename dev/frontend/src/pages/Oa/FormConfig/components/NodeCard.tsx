/**
 * 节点配置卡片组件
 * 展示单个审批节点的配置，支持编辑审批人规则和签署模式
 */
import React, { useState } from 'react';
import { Card, Select, Radio, Tag, Collapse, Typography, Space, Input } from 'antd';
import { SettingOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import type { WorkflowNodeEdit } from '../hooks/useFormDetail';
import { formatCondition } from '../hooks/useFormDetail';
import TimeoutEditor from './TimeoutEditor';

const { Text } = Typography;

interface NodeCardProps {
  node: WorkflowNodeEdit;
  roles: Array<{ code: string; name: string }>;
  fields?: Array<{ key: string; label: string }>;
  onChange: (updatedNode: WorkflowNodeEdit) => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  approval: '审批',
  handle: '办理',
  auto: '自动执行',
  cc: '抄送',
};

const NODE_TYPE_COLORS: Record<string, string> = {
  approval: 'blue',
  handle: 'cyan',
  auto: 'default',
  cc: 'purple',
};

const NodeCard: React.FC<NodeCardProps> = ({ node, roles, fields, onChange }) => {
  const [timeoutExpanded, setTimeoutExpanded] = useState(false);
  const isAuto = node.type === 'auto';
  const isCc = node.type === 'cc';
  const isHandle = node.type === 'handle';
  const isSystemNode = isAuto || isCc; // 系统自动处理的节点（auto/cc）均为只读

  const updateHandler = (field: string, value: unknown) => {
    onChange({
      ...node,
      handler: { ...node.handler, [field]: value },
    });
  };

  const handlerType = node.handler?.useSupervisor
    ? 'supervisor'
    : node.handler?.userId
    ? 'specific'
    : 'role';

  return (
    <Card
      size="small"
      title={
        <Space>
          {isSystemNode ? (
            <Text strong>{`${node.order}. ${node.name}`}</Text>
          ) : (
            <Text strong>{`${node.order}. `}</Text>
          )}
          {!isSystemNode && (
            <Input
              size="small"
              value={node.name}
              onChange={(e) => onChange({ ...node, name: e.target.value })}
              style={{ width: 160, fontWeight: 600 }}
              variant="borderless"
            />
          )}
          {isAuto ? (
            <Tag color={NODE_TYPE_COLORS.auto} icon={<RobotOutlined />}>
              系统自动执行
            </Tag>
          ) : isCc ? (
            <Tag color={NODE_TYPE_COLORS.cc} icon={<SendOutlined />}>
              抄送{node.ccRoles?.length ? `：${node.ccRoles.join('、')}` : ''}
            </Tag>
          ) : (
            <Radio.Group
              size="small"
              value={node.type}
              onChange={(e) => onChange({ ...node, type: e.target.value })}
            >
              <Radio.Button value="approval">{NODE_TYPE_LABELS.approval}</Radio.Button>
              <Radio.Button value="handle">{NODE_TYPE_LABELS.handle}</Radio.Button>
            </Radio.Group>
          )}
          {!!node.condition && <Tag color="orange">有条件</Tag>}
        </Space>
      }
      extra={
        !isSystemNode && (
          <Tag icon={<SettingOutlined />} color="processing">
            可编辑
          </Tag>
        )
      }
      style={{ marginBottom: 8, opacity: isSystemNode ? 0.6 : 1, background: isSystemNode ? '#fafafa' : undefined }}
    >
      {isSystemNode ? (
        <Text type="secondary">
          {isAuto ? '自动执行节点，由系统处理，无需配置审批人' : `抄送节点，流程到达时自动通知：${node.ccRoles?.join('、') || '未配置抄送岗位'}`}
        </Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* 审批人规则 */}
          <div>
            <Text type="secondary">审批人规则：</Text>
            <Radio.Group
              value={handlerType}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'role') {
                  onChange({ ...node, handler: { roleCode: node.handler?.roleCode } });
                } else if (val === 'supervisor') {
                  onChange({ ...node, handler: { useSupervisor: true } });
                } else {
                  onChange({ ...node, handler: { userId: node.handler?.userId } });
                }
              }}
              style={{ display: 'block', marginTop: 4 }}
            >
              <Space direction="vertical">
                <Radio value="role">
                  按岗位
                  {handlerType === 'role' && (
                    <Select
                      size="small"
                      value={node.handler?.roleCode}
                      onChange={(val) => updateHandler('roleCode', val)}
                      style={{ width: 160, marginLeft: 8 }}
                      options={roles.map((r) => ({ value: r.code, label: r.name }))}
                      placeholder="选择岗位"
                    />
                  )}
                </Radio>
                <Radio value="supervisor">按主管（申请人同部门经理）</Radio>
              </Space>
            </Radio.Group>
          </div>

          {/* 签署模式 */}
          <div>
            <Text type="secondary">签署模式：</Text>
            <Radio.Group
              value={node.signMode || 'or'}
              onChange={(e) => onChange({ ...node, signMode: e.target.value })}
              style={{ marginTop: 4 }}
            >
              <Radio value="or">或签（任一人通过即可流转）</Radio>
              <Radio value="and">会签（需全部审批人通过）</Radio>
            </Radio.Group>
          </div>

          {/* 字段编辑权限配置区（办理类型时显示） */}
          {isHandle && (
            <div
              style={{
                padding: '8px 12px',
                background: '#f5f5f5',
                borderRadius: 6,
                border: '1px dashed #d9d9d9',
              }}
            >
              <Text type="secondary">字段编辑权限配置（待完善）</Text>
            </div>
          )}

          {/* 条件展示（只读） */}
          {!!node.condition && (
            <div>
              <Text type="secondary">触发条件：</Text>
              <Tag style={{ marginTop: 4 }}>
                当 {node.conditionDescription || formatCondition(node.condition, fields)} 时触发
              </Tag>
            </div>
          )}

          {/* 时限配置（折叠） */}
          <Collapse
            activeKey={timeoutExpanded ? ['timeout'] : []}
            onChange={() => setTimeoutExpanded(!timeoutExpanded)}
            size="small"
            items={[
              {
                key: 'timeout',
                label: node.timeout ? '时限配置（已启用）' : '时限配置（未启用）',
                children: (
                  <TimeoutEditor
                    timeout={node.timeout as any}
                    onChange={(val) => onChange({ ...node, timeout: val })}
                  />
                ),
              },
            ]}
          />
        </Space>
      )}
    </Card>
  );
};

export default NodeCard;
