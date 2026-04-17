/**
 * 审批中心页面
 * 三栏布局：侧边导航 → 审批列表 → 审批详情 + 流程
 */
import React, { useState, useEffect, useMemo } from 'react';
import { history } from 'umi';
import { Badge, Button, Card, Input, List, Spin, Tag, Empty, Modal, message, Menu, Dropdown, Popconfirm } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  BellOutlined,
  SearchOutlined,
  FilterOutlined,
  RightOutlined,
  UserOutlined,
  RollbackOutlined,
  TeamOutlined,
  MessageOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import {
  ApprovalInstance,
  ApprovalDetail,
  ApprovalStats,
  ViewMode,
  STATUS_LABELS,
  STATUS_COLORS,
  URGENCY_LABELS,
  URGENCY_COLORS,
  NODE_STATUS_LABELS,
  NODE_STATUS_COLORS,
} from '@/types/oa-approval';
import styles from './index.less';

const Center: React.FC = () => {
  // 状态
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('pending');
  const [stats, setStats] = useState<ApprovalStats>({ total: 0, pending: 0, processed: 0, approved: 0, rejected: 0, my: 0, cc: 0 });
  const [list, setList] = useState<ApprovalInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [transferModalVisible, setTransferModalVisible] = useState(false);

  // 加载统计数据
  useEffect(() => {
    loadStats();
  }, []);

  // 加载列表数据
  useEffect(() => {
    loadList();
  }, [viewMode, page]);

  // 加载详情
  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId]);

  const loadStats = async () => {
    try {
      const res = await oaApprovalApi.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const result = await oaApprovalApi.getApprovalList({ viewMode, page, pageSize: 20 });
      setList(result.data);
      setTotal(result.total);
      // 默认选中第一个
      if (result.data.length > 0 && !selectedId) {
        setSelectedId(result.data[0].id);
      }
    } catch (error) {
      console.error('加载列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await oaApprovalApi.getDetail(id);
      setDetail(res.data);
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // 导航项配置
  const navItems = [
    { key: 'pending', label: '待处理的', icon: <ClockCircleOutlined />, count: stats.pending, badgeType: 'number' },
    { key: 'processed', label: '已处理的', icon: <CheckCircleOutlined />, count: null },
    { key: 'my', label: '我发起的', icon: <SendOutlined />, count: null },
    { key: 'cc', label: '抄送我的', icon: <BellOutlined />, count: stats.cc, badgeType: 'dot' },
  ];

  // 点击导航
  const handleNavClick = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(1);
    setSelectedId(null);
    setDetail(null);
  };

  // 点击列表项
  const handleItemClick = (item: ApprovalInstance) => {
    setSelectedId(item.id);
  };

  // 同意审批
  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      await oaApprovalApi.approve(selectedId);
      message.success('审批通过');
      loadList();
      loadStats();
      loadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // 拒绝审批
  const handleReject = async () => {
    if (!selectedId || !rejectReason.trim()) {
      message.error('请填写拒绝原因');
      return;
    }
    try {
      await oaApprovalApi.reject(selectedId, { comment: rejectReason });
      message.success('已拒绝');
      setRejectModalVisible(false);
      setRejectReason('');
      loadList();
      loadStats();
      loadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // 撤回审批
  const handleWithdraw = async () => {
    if (!selectedId) return;
    try {
      await oaApprovalApi.withdraw(selectedId);
      message.success('撤回成功');
      loadList();
      loadStats();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    return (
      <Tag color={STATUS_COLORS[status as keyof typeof STATUS_COLORS] || 'default'}>
        {STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}
      </Tag>
    );
  };

  // 渲染紧急程度标签
  const renderUrgencyTag = (urgency: string) => {
    if (urgency === 'normal') return null;
    return (
      <Tag color={URGENCY_COLORS[urgency as keyof typeof URGENCY_COLORS]}>
        {URGENCY_LABELS[urgency as keyof typeof URGENCY_LABELS]}
      </Tag>
    );
  };

  // 渲染左侧导航
  const renderNav = () => (
    <div className={styles.nav}>
      {navItems.map((item) => (
        <div
          key={item.key}
          className={`${styles.navItem} ${viewMode === item.key ? styles.navItemActive : ''}`}
          onClick={() => handleNavClick(item.key as ViewMode)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navLabel}>{item.label}</span>
          {item.badgeType === 'number' && item.count && item.count > 0 && (
            <Badge count={item.count} style={{ backgroundColor: '#fa8c16' }} />
          )}
          {item.badgeType === 'dot' && item.count && item.count > 0 && (
            <Badge dot style={{ backgroundColor: '#f5222d' }} />
          )}
        </div>
      ))}
    </div>
  );

  // 渲染审批列表
  const renderList = () => (
    <div className={styles.listPanel}>
      <div className={styles.listHeader}>
        <Input
          className={styles.searchInput}
          placeholder="搜索审批单..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />
        <Button icon={<FilterOutlined />}>筛选</Button>
      </div>

      <div className={styles.listContent}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <Spin />
          </div>
        ) : list.length === 0 ? (
          <Empty description="暂无数据" />
        ) : (
          <List
            dataSource={list}
            renderItem={(item) => (
              <div
                className={`${styles.listItem} ${selectedId === item.id ? styles.listItemActive : ''}`}
                onClick={() => handleItemClick(item)}
              >
                <div className={styles.itemHeader}>
                  <span className={styles.itemTitle}>{item.title}</span>
                  <span className={styles.itemDate}>
                    {new Date(item.submittedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.itemInfo}>
                  <span className={styles.itemApplicant}>{item.applicantName}</span>
                  <span className={styles.itemType}>{item.formTypeName}</span>
                </div>
                <div className={styles.itemFooter}>
                  <Tag color="orange">等待 {item.currentNodeName || '处理'}</Tag>
                  {renderUrgencyTag(item.urgency)}
                </div>
              </div>
            )}
          />
        )}
      </div>

      {total > 20 && (
        <div className={styles.listFooter}>
          <Button onClick={() => setPage(page - 1)} disabled={page === 1}>
            上一页
          </Button>
          <span>{page} / {Math.ceil(total / 20)}</span>
          <Button onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 20)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );

  // 渲染审批详情
  const renderDetail = () => {
    if (detailLoading) {
      return (
        <div className={styles.detailPanel}>
          <div className={styles.loadingContainer}>
            <Spin />
          </div>
        </div>
      );
    }

    if (!detail) {
      return (
        <div className={styles.detailPanel}>
          <Empty description="请选择审批单查看详情" />
        </div>
      );
    }

    return (
      <div className={styles.detailPanel}>
        {/* 头部信息 */}
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{detail.formTypeName}</h2>
          <div className={styles.detailMeta}>
            <span>编号: {detail.instanceNo}</span>
            <span>申请人: {detail.applicantName}</span>
            <span>部门: {detail.applicantDept || '-'}</span>
          </div>
          <div className={styles.detailStatus}>
            {renderStatusTag(detail.status)}
            {renderUrgencyTag(detail.urgency)}
          </div>
        </div>

        {/* AI风险检查占位 */}
        <div className={styles.aiRiskCard}>
          <span className={styles.aiIcon}>🤖</span>
          <span>AI风险检查: 低风险</span>
          <Button type="link">详情</Button>
        </div>

        {/* 表单数据 */}
        <div className={styles.formDataSection}>
          <h3>表单数据</h3>
          <div className={styles.formDataList}>
            {Object.entries(detail.formData).map(([key, value]) => (
              <div key={key} className={styles.formDataRow}>
                <span className={styles.formLabel}>{key}</span>
                <span className={styles.formValue}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 流程时间线 */}
        <div className={styles.timelineSection}>
          <h3>流程时间线</h3>
          <div className={styles.timeline}>
            {detail.nodes.map((node, index) => (
              <div key={node.id} className={styles.timelineItem}>
                <div
                  className={`${styles.timelineDot} ${
                    styles[`timelineDot_${node.status}`]
                  }`}
                >
                  {node.status === 'approved' && '✓'}
                  {node.status === 'rejected' && '✗'}
                  {node.status === 'pending' && '○'}
                </div>
                <div className={styles.timelineContent}>
                  <div className={styles.timelineTitle}>{node.nodeName}</div>
                  <div className={styles.timelineInfo}>
                    {node.assignedUserName || '待分配'}
                    {node.status === 'approved' && (
                      <Tag color="green" style={{ marginLeft: 8 }}>
                        已通过
                      </Tag>
                    )}
                    {node.status === 'rejected' && (
                      <Tag color="red" style={{ marginLeft: 8 }}>
                        已拒绝
                      </Tag>
                    )}
                  </div>
                  {node.comment && (
                    <div className={styles.timelineComment}>意见: {node.comment}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 操作区 */}
        {viewMode === 'pending' && detail.status === 'pending' && (
          <div className={styles.actionBar}>
            <div className={styles.actionLeft}>
              <Button icon={<UserOutlined />}>转交</Button>
              <Button icon={<RollbackOutlined />}>退回</Button>
              <Button icon={<TeamOutlined />}>加签</Button>
              <Button icon={<MessageOutlined />}>评论</Button>
            </div>
            <div className={styles.actionRight}>
              <Button danger onClick={() => setRejectModalVisible(true)}>
                拒绝
              </Button>
              <Button type="primary" onClick={handleApprove}>
                同意
              </Button>
            </div>
          </div>
        )}

        {/* 撤回按钮（仅申请人可见） */}
        {viewMode === 'my' && detail.status === 'pending' && (
          <div className={styles.actionBar}>
            <Popconfirm
              title="确定要撤回此审批吗？"
              onConfirm={handleWithdraw}
              okText="确定"
              cancelText="取消"
            >
              <Button danger>撤回审批</Button>
            </Popconfirm>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {renderNav()}
      {renderList()}
      {renderDetail()}

      {/* 拒绝弹窗 */}
      <Modal
        title="拒绝审批"
        open={rejectModalVisible}
        onOk={handleReject}
        onCancel={() => {
          setRejectModalVisible(false);
          setRejectReason('');
        }}
        okText="确认拒绝"
        cancelText="取消"
      >
        <Input.TextArea
          placeholder="请输入拒绝原因"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
        />
      </Modal>
    </div>
  );
};

export default Center;
