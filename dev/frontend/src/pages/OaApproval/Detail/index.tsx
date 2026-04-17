import React, { useState, useEffect, useCallback } from 'react';
import { useParams, history } from 'umi';
import {
  Card,
  Descriptions,
  Button,
  Tag,
  Steps,
  Timeline,
  Avatar,
  Modal,
  Input,
  message,
  Spin,
  Row,
  Col,
  Divider,
  Typography,
  Tooltip,
  Space,
  Popconfirm,
  Select,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  ClockCircleOutlined,
  AuditOutlined,
  SendOutlined,
  SwapOutlined,
  TeamOutlined,
  RollbackOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type {
  ApprovalDetail,
  ApprovalNode,
  ApprovalAction,
  FormField,
} from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import styles from './index.less';

const { TextArea } = Input;
const { Step } = Steps;
const { Text, Title } = Typography;
const { Option } = Select;

// 审批状态标签
const ApprovalStatusTag: React.FC<{ status: string }> = ({ status }) => {
  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'processing', text: '审批中' },
    approved: { color: 'success', text: '已通过' },
    rejected: { color: 'error', text: '已驳回' },
    withdrawn: { color: 'default', text: '已撤回' },
    cancelled: { color: 'warning', text: '已取消' },
  };
  const config = statusMap[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

// 紧急程度标签
const UrgencyTag: React.FC<{ urgency: string }> = ({ urgency }) => {
  const urgencyMap: Record<string, { color: string; text: string }> = {
    normal: { color: 'default', text: '普通' },
    urgent: { color: 'warning', text: '紧急' },
    very_urgent: { color: 'error', text: '非常紧急' },
  };
  const config = urgencyMap[urgency] || { color: 'default', text: urgency };
  return <Tag color={config.color}>{config.text}</Tag>;
};

// 字段渲染器
const FieldRenderer: React.FC<{ field: FormField; value: unknown }> = ({ field, value }) => {
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">-</Text>;
  }

  switch (field.type) {
    case 'money':
      return <Text strong>{formatCurrency(value as number)}</Text>;
    case 'number':
      return <Text>{(value as number).toLocaleString()}</Text>;
    case 'date':
      return <Text>{formatDate(value as string)}</Text>;
    case 'datetime':
      return <Text>{formatDateTime(value as string)}</Text>;
    case 'select':
    case 'radio':
      const option = field.options?.find((o) => o.value === value);
      return <Text>{option?.label || (value as string)}</Text>;
    case 'upload':
      const files = value as Array<{ name: string; url: string }>;
      if (!files || files.length === 0) return <Text type="secondary">-</Text>;
      return (
        <div className={styles.fileList}>
          {files.map((file, index) => (
            <a key={index} href={file.url} target="_blank" rel="noopener noreferrer">
              <FileTextOutlined /> {file.name}
            </a>
          ))}
        </div>
      );
    case 'user':
      return <Text>{(value as { name: string }).name || (value as string)}</Text>;
    case 'dept':
      return <Text>{(value as { name: string }).name || (value as string)}</Text>;
    case 'textarea':
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{value as string}</Text>;
    default:
      return <Text>{value as string}</Text>;
  }
};

const ApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [nodes, setNodes] = useState<ApprovalNode[]>([]);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // 操作弹窗
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'transfer' | 'countersign' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [transferUserId, setTransferUserId] = useState<number | null>(null);

  // 加载详情
  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detailRes, nodesRes, actionsRes] = await Promise.all([
        oaApprovalApi.getDetail(parseInt(id)),
        oaApprovalApi.getNodes(parseInt(id)),
        oaApprovalApi.getActions(parseInt(id)),
      ]);
      setDetail(detailRes.data);
      setNodes(nodesRes.data);
      setActions(actionsRes.data);
    } catch (error) {
      message.error('加载审批详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // 执行审批操作
  const handleAction = async () => {
    if (!id || !actionType) return;

    if (actionType === 'transfer' && !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }

    setActionLoading(true);
    try {
      switch (actionType) {
        case 'approve':
          await oaApprovalApi.approve(parseInt(id), { comment: actionComment });
          message.success('审批通过');
          break;
        case 'reject':
          await oaApprovalApi.reject(parseInt(id), { comment: actionComment });
          message.success('已驳回');
          break;
        case 'transfer':
          await oaApprovalApi.transfer(parseInt(id), { transferToUserId: transferUserId!, comment: actionComment });
          message.success('已转交');
          break;
        case 'countersign':
          // 需要收集加签人员信息
          message.warning('加签功能需要选择加签人员');
          break;
      }
      setActionModalVisible(false);
      setActionComment('');
      setTransferUserId(null);
      loadDetail();
    } catch (error) {
      message.error('操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 撤回审批
  const handleWithdraw = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await oaApprovalApi.withdraw(parseInt(id));
      message.success('已撤回');
      loadDetail();
    } catch (error) {
      message.error('撤回失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 打开操作弹窗
  const openActionModal = (type: 'approve' | 'reject' | 'transfer' | 'countersign') => {
    setActionType(type);
    setActionModalVisible(true);
  };

  // 获取操作弹窗标题
  const getActionModalTitle = () => {
    switch (actionType) {
      case 'approve':
        return '审批通过';
      case 'reject':
        return '审批驳回';
      case 'transfer':
        return '转交审批';
      case 'countersign':
        return '加签处理';
      default:
        return '审批操作';
    }
  };

  // 检查当前用户是否可以操作
  const canOperate = () => {
    if (!detail || detail.status !== 'pending') return false;
    const currentNode = nodes.find((n) => n.status === 'pending');
    if (!currentNode) return false;
    // 简化判断：当前节点状态为 pending 即可操作
    return true;
  };

  // 检查是否可以撤回
  const canWithdraw = () => {
    if (!detail || detail.status !== 'pending') return false;
    // 申请人可以撤回
    return true;
  };

  // 获取当前步骤索引
  const getCurrentStep = () => {
    const pendingIndex = nodes.findIndex((n) => n.status === 'pending');
    if (pendingIndex === -1) {
      if (detail?.status === 'approved') return nodes.length;
      if (detail?.status === 'rejected') return 0;
    }
    return pendingIndex;
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.errorContainer}>
        <Text>审批不存在或已删除</Text>
        <Button type="primary" onClick={() => history.push('/oa/center')}>
          返回审批中心
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.detailPage}>
      {/* 顶部导航 */}
      <div className={styles.pageHeader}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => history.back()}>
          返回
        </Button>
        <div className={styles.headerInfo}>
          <Title level={4}>{detail.formTypeName}</Title>
          <Text type="secondary">编号：{detail.instanceNo}</Text>
        </div>
        <div className={styles.headerActions}>
          <ApprovalStatusTag status={detail.status} />
          <UrgencyTag urgency={detail.urgency} />
        </div>
      </div>

      <Row gutter={24}>
        {/* 左侧：表单内容 */}
        <Col span={16}>
          {/* 基本信息卡片 */}
          <Card title="基本信息" className={styles.card}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="申请编号">{detail.instanceNo}</Descriptions.Item>
              <Descriptions.Item label="申请类型">{detail.formTypeName}</Descriptions.Item>
              <Descriptions.Item label="申请人">{detail.applicantName}</Descriptions.Item>
              <Descriptions.Item label="申请部门">{detail.applicantDept || '-'}</Descriptions.Item>
              <Descriptions.Item label="申请时间">{formatDateTime(detail.submittedAt)}</Descriptions.Item>
              <Descriptions.Item label="紧急程度">
                <UrgencyTag urgency={detail.urgency} />
              </Descriptions.Item>
              <Descriptions.Item label="审批状态" span={2}>
                <ApprovalStatusTag status={detail.status} />
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 表单内容卡片 */}
          <Card title="表单内容" className={styles.card}>
            <Descriptions column={2} bordered size="small">
              {Object.entries(detail.formData).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>

          {/* 审批记录卡片 */}
          <Card title="审批记录" className={styles.card}>
            <Timeline
              items={actions.map((action) => {
                let icon = <ClockCircleOutlined />;
                let color = 'blue';
                switch (action.actionType) {
                  case 'approve':
                    icon = <CheckCircleOutlined />;
                    color = 'green';
                    break;
                  case 'reject':
                    icon = <CloseCircleOutlined />;
                    color = 'red';
                    break;
                  case 'transfer':
                    icon = <SwapOutlined />;
                    color = 'orange';
                    break;
                  case 'countersign':
                    icon = <TeamOutlined />;
                    color = 'purple';
                    break;
                  case 'withdraw':
                    icon = <RollbackOutlined />;
                    color = 'gray';
                    break;
                }
                return {
                  dot: <Avatar icon={icon} style={{ backgroundColor: color }} size="small" />,
                  children: (
                    <div className={styles.timelineItem}>
                      <div className={styles.timelineHeader}>
                        <Text strong>{action.operatorName}</Text>
                        <Text type="secondary">{formatDateTime(action.actionAt)}</Text>
                      </div>
                      <div className={styles.timelineContent}>
                        <Tag>{getActionText(action.actionType)}</Tag>
                        {action.comment && <Text type="secondary">：{action.comment}</Text>}
                      </div>
                    </div>
                  ),
                };
              })}
            />
          </Card>
        </Col>

        {/* 右侧：审批流程 */}
        <Col span={8}>
          {/* 操作按钮卡片 */}
          {canOperate() && (
            <Card className={styles.card}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  block
                  onClick={() => openActionModal('approve')}
                >
                  通过
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  block
                  onClick={() => openActionModal('reject')}
                >
                  驳回
                </Button>
                <Button
                  icon={<SwapOutlined />}
                  block
                  onClick={() => openActionModal('transfer')}
                >
                  转交
                </Button>
                <Button
                  icon={<TeamOutlined />}
                  block
                  onClick={() => openActionModal('countersign')}
                >
                  加签
                </Button>
              </Space>
            </Card>
          )}

          {/* 撤回按钮 */}
          {canWithdraw() && !canOperate() && (
            <Card className={styles.card}>
              <Popconfirm
                title="确定要撤回此审批吗？"
                onConfirm={handleWithdraw}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  icon={<RollbackOutlined />}
                  block
                  loading={actionLoading}
                >
                  撤回审批
                </Button>
              </Popconfirm>
            </Card>
          )}

          {/* 审批流程卡片 */}
          <Card title="审批流程" className={styles.card}>
            <Steps
              direction="vertical"
              current={getCurrentStep()}
              status={detail.status === 'rejected' ? 'error' : 'process'}
            >
              {nodes.map((node, index) => {
                let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
                if (node.status === 'approved') status = 'finish';
                else if (node.status === 'rejected') status = 'error';
                else if (node.status === 'pending') status = 'process';

                return (
                  <Step
                    key={node.id}
                    title={node.nodeName}
                    description={
                      <div className={styles.stepDescription}>
                        {node.assignedUserName && (
                          <Text>
                            <UserOutlined /> {node.assignedUserName}
                          </Text>
                        )}
                        {node.actedAt && (
                          <Text type="secondary" style={{ marginLeft: 8 }}>
                            {formatDateTime(node.actedAt)}
                          </Text>
                        )}
                        {node.comment && (
                          <Text type="secondary" className={styles.stepComment}>
                            {node.comment}
                          </Text>
                        )}
                      </div>
                    }
                    status={status}
                  />
                );
              })}
            </Steps>
          </Card>

          {/* AI 风险检测卡片 */}
          {(detail as any).aiRiskCheck && (
            <Card
              title={
                <span>
                  <SafetyCertificateOutlined style={{ marginRight: 8 }} />
                  AI 风险检测
                </span>
              }
              className={styles.card}
            >
              <div className={styles.aiRiskCheck}>
                {((detail as any).aiRiskCheck?.risks || []).map((risk: { level: string; message: string }, index: number) => (
                  <div key={index} className={styles.riskItem}>
                    <Tag color={risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'orange' : 'blue'}>
                      {risk.level === 'high' ? '高风险' : risk.level === 'medium' ? '中风险' : '低风险'}
                    </Tag>
                    <Text>{risk.message}</Text>
                  </div>
                ))}
                {!((detail as any).aiRiskCheck?.risks?.length) && (
                  <Text type="secondary">未检测到风险</Text>
                )}
              </div>
            </Card>
          )}
        </Col>
      </Row>

      {/* 操作弹窗 */}
      <Modal
        title={getActionModalTitle()}
        open={actionModalVisible}
        onOk={handleAction}
        onCancel={() => {
          setActionModalVisible(false);
          setActionComment('');
          setTransferUserId(null);
        }}
        confirmLoading={actionLoading}
        okText="确定"
        cancelText="取消"
      >
        <div className={styles.actionModal}>
          {actionType === 'transfer' && (
            <div className={styles.formItem}>
              <label>转交人员：</label>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择转交人员"
                onChange={(value) => setTransferUserId(value)}
                showSearch
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {/* 这里应该从后端获取用户列表，暂时使用占位符 */}
                <Option value={1}>张三</Option>
                <Option value={2}>李四</Option>
                <Option value={3}>王五</Option>
              </Select>
            </div>
          )}
          <div className={styles.formItem}>
            <label>审批意见：</label>
            <TextArea
              rows={4}
              placeholder="请输入审批意见（选填）"
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

// 获取操作类型文本
function getActionText(actionType: string): string {
  const actionMap: Record<string, string> = {
    approve: '通过',
    reject: '驳回',
    transfer: '转交',
    countersign: '加签',
    withdraw: '撤回',
    submit: '提交',
  };
  return actionMap[actionType] || actionType;
}

export default ApprovalDetailPage;
