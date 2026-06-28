/**
 * 表单编辑详情页
 * 3 Tab 布局：审批流程 / 字段权限 / 查看权限
 * 基本信息由列表页内联编辑管理，此页专注复杂配置。
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Spin,
  Typography,
  Tabs,
  Divider,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { history, useParams, useSearchParams } from 'umi';
import { useFormDetail, type WorkflowNodeEdit } from './hooks/useFormDetail';
import NodeCard from './components/NodeCard';
import FieldPermissionMatrix from './components/FieldPermissionMatrix';
import ViewPermissionMatrix from './components/ViewPermissionMatrix';
import FlowPreview from './components/FlowPreview';
import styles from './Detail.less';

const { Title } = Typography;

const TAB_KEYS = {
  workflow: 'workflow',
  fieldPerm: 'fieldPerm',
  viewPerm: 'viewPerm',
} as const;

type TabKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];

const FormDetailPage: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabKey) || TAB_KEYS.workflow;

  const {
    formDetail,
    roles,
    loading,
    savingWorkflow,
    saveWorkflow,
  } = useFormDetail(code);

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

  const handleSaveWorkflow = async () => {
    if (!formDetail) return;
    const nodes = editingNodes || formDetail.workflowDef.nodes;
    await saveWorkflow(nodes);
    // 保存成功后清除本地编辑状态
    setEditingNodes(null);
  };

  const handleTabChange = useCallback((key: string) => {
    setSearchParams({ tab: key });
  }, [setSearchParams]);

  /** 供字段权限矩阵使用的字段列表 */
  const fields = useMemo(
    () => (formDetail?.formSchema?.fields || []) as any,
    [formDetail]
  );

  if (loading || !formDetail) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  const tabItems = [
    {
      key: TAB_KEYS.workflow,
      label: '审批流程',
      children: (
        <Card
          title="审批流程配置"
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
          <div className={styles.workflowLayout}>
            <div className={styles.workflowNodes}>
              {nodes.map((node, index) => (
                <NodeCard
                  key={node.order}
                  node={node}
                  roles={roles}
                  fields={formDetail.formSchema?.fields as any}
                  onChange={(updated) => handleNodeChange(index, updated)}
                />
              ))}
            </div>
            <div className={styles.workflowPreview}>
              <Card title="流程预览" size="small">
                <FlowPreview nodes={nodes} fields={formDetail.formSchema?.fields as any} />
              </Card>
            </div>
          </div>
        </Card>
      ),
    },
    {
      key: TAB_KEYS.fieldPerm,
      label: '字段权限',
      children: (
        <FieldPermissionMatrix
          formCode={formDetail.code}
          fields={fields}
          workflowNodes={formDetail.workflowDef.nodes as any}
          initialPermissions={formDetail.fieldPermissions as any}
        />
      ),
    },
    {
      key: TAB_KEYS.viewPerm,
      label: '查看权限',
      children: (
        <ViewPermissionMatrix
          formCode={formDetail.code}
          fields={fields}
          workflowNodes={formDetail.workflowDef.nodes as any}
          initialViewPermissions={formDetail.viewPermissions as any}
          dataReadRoles={formDetail.dataReadRoles}
          dataReadUsers={formDetail.dataReadUsers}
        />
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* 顶部导航 */}
      <div className={styles.header}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/oa/form-config')}>
          返回表单列表
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {formDetail.name} — 配置
        </Title>
        <Tag>{formDetail.code}</Tag>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        destroyInactiveTabPane={false}
      />
    </div>
  );
};

export default FormDetailPage;
