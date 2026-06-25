/**
 * 流程预览组件
 * @module pages/Oa/FormConfig/components/FlowPreview
 *
 * 从 Detail.tsx 提取的垂直流程图渲染组件。
 * 展示节点名称、类型、审批人规则和条件信息。
 */
import React from 'react';
import { Card, Tag, Typography, Space } from 'antd';
import { formatCondition } from '../utils/fieldUtils';
import type { WorkflowNodeEdit } from '../hooks/useFormDetail';

const { Text } = Typography;

interface FlowPreviewProps {
  nodes: WorkflowNodeEdit[];
  fields?: Array<{ key: string; label: string }>;
}

const FlowPreview: React.FC<FlowPreviewProps> = ({ nodes, fields }) => {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {nodes
        .filter((n) => n.type !== 'auto' || !n.condition)
        .map((node, index, arr) => (
          <React.Fragment key={node.order}>
            <Card
              size="small"
              style={{
                borderLeft: `3px solid ${
                  node.type === 'auto'
                    ? '#d9d9d9'
                    : node.type === 'cc'
                    ? '#1890ff'
                    : '#1890ff'
                }`,
                opacity: node.type === 'auto' ? 0.6 : 1,
              }}
            >
              <Text strong>{node.name}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {node.type === 'auto'
                  ? '系统自动执行'
                  : node.type === 'cc'
                  ? `抄送：${(node as any).ccRoles?.join(', ') || '未配置'}`
                  : `审批人：${
                      node.handler?.roleCode ||
                      (node.handler?.useSupervisor ? '申请人主管' : '未配置')
                    } · ${node.signMode === 'and' ? '会签' : '或签'}`}
              </Text>
              {!!node.condition && (
                <Tag color="orange" style={{ marginTop: 4, display: 'block' }}>
                  条件：当 {node.conditionDescription || formatCondition(node.condition, fields)} 时触发
                </Tag>
              )}
            </Card>
            {index < arr.length - 1 && (
              <div style={{ textAlign: 'center', color: '#bfbfbf' }}>↓</div>
            )}
          </React.Fragment>
        ))}
    </Space>
  );
};

export default FlowPreview;
