/**
 * 表单编辑页
 * 左右两栏：左侧编辑区（基本信息 + 审批流程节点） + 右侧流程预览
 */
import React, { useState, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Divider,
  Spin,
  Typography,
  Row,
  Col,
  message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { history, useParams } from 'umi';
import { useFormDetail, formatCondition, type WorkflowNodeEdit } from './hooks/useFormDetail';
import NodeCard from './components/NodeCard';
import FieldPermissionMatrix from './components/FieldPermissionMatrix';

const { Title, Text } = Typography;
const { TextArea } = Input;

const CATEGORY_OPTIONS = [
  { value: 'finance', label: '财务' },
  { value: 'supply_chain', label: '供应链' },
  { value: 'marketing', label: '营销' },
  { value: 'hr', label: '人事' },
  { value: 'admin', label: '行政' },
];

const FormDetailPage: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();
  const {
    formDetail,
    roles,
    loading,
    savingBasic,
    savingWorkflow,
    saveBasicInfo,
    saveWorkflow,
  } = useFormDetail(code);

  const [basicForm] = Form.useForm();
  // 本地编辑中的流程节点（未保存的修改）
  const [editingNodes, setEditingNodes] = useState<WorkflowNodeEdit[] | null>(null);

  // 当数据加载完成后，初始化本地编辑状态
  const nodes = editingNodes ?? formDetail?.workflowDef?.nodes ?? [];

  const handleNodeChange = useCallback(
    (index: number, updatedNode: WorkflowNodeEdit) => {
      const newNodes = [...nodes];
      newNodes[index] = updatedNode;
      setEditingNodes(newNodes);
    },
    [nodes]
  );

  const handleSaveBasic = async () => {
    try {
      const values = await basicForm.validateFields();
      await saveBasicInfo({
        name: values.name,
        description: values.description,
        allowedRoles: values.allowedRoles || null,
        dataReadRoles: values.dataReadRoles || null,
        dataExportRoles: values.dataExportRoles || null,
      });
    } catch (error) {
      // 表单验证失败
    }
  };

  const handleSaveWorkflow = async () => {
    if (!formDetail) return;
    const workflowDef = {
      ...formDetail.workflowDef,
      nodes: editingNodes || formDetail.workflowDef.nodes,
    };
    await saveWorkflow(workflowDef, formDetail.version);
    // 保存成功后清除本地编辑状态
    setEditingNodes(null);
  };

  if (loading || !formDetail) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 顶部导航 */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/oa/form-config')}>
          返回表单列表
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {formDetail.name} — 编辑
        </Title>
        <Tag>{formDetail.code}</Tag>
      </Space>

      <Row gutter={24}>
        {/* 左侧编辑区 60% */}
        <Col span={14}>
          {/* 基本信息 */}
          <Card title="基本信息" size="small" style={{ marginBottom: 16 }}>
            <Form
              form={basicForm}
              layout="vertical"
              initialValues={{
                name: formDetail.name,
                description: formDetail.description,
                allowedRoles: formDetail.allowedRoles || [],
                dataReadRoles: formDetail.dataReadRoles || [],
                dataExportRoles: formDetail.dataExportRoles || [],
              }}
            >
              <Form.Item name="name" label="表单名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label="描述">
                <TextArea rows={2} />
              </Form.Item>
              <Form.Item name="allowedRoles" label="可发起岗位（留空表示不限制）">
                <Select
                  mode="multiple"
                  placeholder="选择允许发起此表单的岗位"
                  options={roles.map((r) => ({ value: r.code, label: r.name }))}
                  allowClear
                />
              </Form.Item>
              <Divider orientation="left" plain>
                数据权限
              </Divider>
              <Form.Item name="dataReadRoles" label="可查看数据的岗位（留空表示不限制）">
                <Select
                  mode="multiple"
                  placeholder="选择可查看此表单数据的岗位"
                  options={roles.map((r) => ({ value: r.code, label: r.name }))}
                  allowClear
                />
              </Form.Item>
              <Form.Item name="dataExportRoles" label="可导出数据的岗位（留空表示不限制）">
                <Select
                  mode="multiple"
                  placeholder="选择可导出此表单数据的岗位"
                  options={roles.map((r) => ({ value: r.code, label: r.name }))}
                  allowClear
                />
              </Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingBasic}
                onClick={handleSaveBasic}
              >
                保存基本信息
              </Button>
            </Form>
          </Card>

          {/* 审批流程 */}
          <Card
            title="审批流程"
            size="small"
            extra={
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingWorkflow}
                disabled={!editingNodes}
                onClick={handleSaveWorkflow}
              >
                保存流程配置
              </Button>
            }
          >
            {nodes.map((node, index) => (
              <NodeCard
                key={node.order}
                node={node}
                roles={roles}
                fields={formDetail.formSchema?.fields as any}
                onChange={(updated) => handleNodeChange(index, updated)}
              />
            ))}

            <Divider />
          </Card>
          {/* 字段权限配置矩阵 */}
          {formDetail.formSchema?.fields && (
            <FieldPermissionMatrix
              formCode={formDetail.code}
              fields={formDetail.formSchema.fields as any}
              workflowNodes={formDetail.workflowDef.nodes as any}
              initialPermissions={formDetail.fieldPermissions as any}
            />
          )}
        </Col>

        {/* 右侧流程预览 40% */}
        <Col span={10}>
          <Card title="流程预览" size="small" style={{ position: 'sticky', top: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {nodes
                .filter((n) => n.type !== 'auto' || !n.condition)
                .map((node, index) => (
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
                          条件：当 {node.conditionDescription || formatCondition(node.condition, formDetail.formSchema?.fields as any)} 时触发
                        </Tag>
                      )}
                    </Card>
                    {index < nodes.length - 1 && (
                      <div style={{ textAlign: 'center', color: '#bfbfbf' }}>↓</div>
                    )}
                  </React.Fragment>
                ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default FormDetailPage;
