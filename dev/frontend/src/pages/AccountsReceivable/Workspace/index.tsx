/**
 * 催收与审核工作台主页面
 * 包含多个Tab：所有催收任务、逾期前预警、我的催收、待审核、已处理
 * 管理员视角显示额外Tab
 */
import React, { useState, useEffect, useCallback, createContext } from 'react';
import { Tabs, Badge, Card, Statistic, Row, Col, Spin } from 'antd';
import {
  BellOutlined,
  AuditOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ArCustomerCollectionTask } from '@/types/accounts-receivable';
import {
  getCustomerTasks,
  getCustomerReviewTasks,
  getCustomerHistoryRecords,
  getAllTasks,
  getPreWarningData,
} from '@/services/api/accounts-receivable';
import useAuth from '@/models/auth';
import { useMobileDetect } from './shared/hooks/useMobileDetect';
import CustomerTaskList from './components/CustomerTaskList';
import ReviewTaskList from './components/ReviewTaskList';
import HistoryList from './components/HistoryList';
import CustomerCollectionModal from './components/CustomerCollectionModal';
import TaskDetail from './components/TaskDetail';
import AllCollectionTasks from './components/AllCollectionTasks';
import PreWarningList from './components/PreWarningList';
import styles from './index.less';

/** 工作台上下文，传递移动端状态给子组件 */
export const WorkspaceContext = createContext<{
  isMobile: boolean;
}>({
  isMobile: false,
});

type TabKey = 'all-tasks' | 'pre-warning' | 'collection' | 'review' | 'history';
type QuickAction = 'customer_delay' | 'guarantee' | 'paidOff' | 'escalate' | undefined;

const Workspace: React.FC = () => {
  const { hasRole, hasPermission, fetchCurrentUser, currentUser } = useAuth();

  // 初始化用户信息
  useEffect(() => {
    if (!currentUser) {
      fetchCurrentUser();
    }
  }, [currentUser, fetchCurrentUser]);

  // 判断是否为管理员（有 admin 角色或 finance:ar:manage 权限）
  const isAdmin = hasRole('admin') || hasPermission('finance:ar:manage');

  const [activeTab, setActiveTab] = useState<TabKey>(isAdmin ? 'all-tasks' : 'collection');
  const [counts, setCounts] = useState({
    collection: 0,
    review: 0,
    history: 0,
    allTasks: 0,
    preWarn2: 0,
    preWarn5: 0,
    preWarn2Total: 0,
    preWarn5Total: 0,
  });
  const [loading, setLoading] = useState(false);
  const { isMobile } = useMobileDetect();

  // 催收弹窗状态
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [currentTask, setCurrentTask] = useState<ArCustomerCollectionTask | null>(null);
  const [initialAction, setInitialAction] = useState<QuickAction>(undefined);

  // 详情抽屉状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailArId, setDetailArId] = useState<number | null>(null);

  // 加载待办统计
  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        getCustomerTasks({ page: 1, pageSize: 1 }),
        getCustomerReviewTasks({ page: 1, pageSize: 1 }),
        getCustomerHistoryRecords({ page: 1, pageSize: 1 }),
      ];

      // 管理员加载额外统计
      if (isAdmin) {
        promises.push(getAllTasks({ page: 1, pageSize: 1 }));
        promises.push(getPreWarningData());
      }

      const results = await Promise.all(promises);

      const newCounts = {
        collection: results[0]?.data?.total || results[0]?.total || 0,
        review: results[1]?.data?.total || results[1]?.total || 0,
        history: results[2]?.data?.total || results[2]?.total || 0,
        allTasks: isAdmin ? (results[3]?.total || 0) : 0,
        preWarn2: isAdmin ? (results[4]?.preWarn2Count || 0) : 0,
        preWarn5: isAdmin ? (results[4]?.preWarn5Count || 0) : 0,
        preWarn2Total: isAdmin ? (results[4]?.preWarn2Total || 0) : 0,
        preWarn5Total: isAdmin ? (results[4]?.preWarn5Total || 0) : 0,
      };

      setCounts(newCounts);
    } catch (error) {
      console.error('加载统计失败:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // 打开催收弹窗（支持指定操作类型）
  const handleTaskClick = (task: ArCustomerCollectionTask, action?: QuickAction) => {
    setCurrentTask(task);
    setInitialAction(action);
    setCollectionModalVisible(true);
  };

  // 打开详情
  const handleViewDetail = (arId: number) => {
    setDetailArId(arId);
    setDetailVisible(true);
  };

  // 催收成功回调
  const handleCollectionSuccess = () => {
    loadCounts();
  };

  // 统计卡片点击跳转
  const handleStatCardClick = (tabKey: TabKey) => {
    setActiveTab(tabKey);
  };

  // 刷新统计
  const handleRefreshCounts = () => {
    loadCounts();
  };

  // 格式化金额（万元）
  const formatAmountWan = (amount: number): string => {
    if (!amount || amount === 0) return '¥0';
    const wan = amount / 10000;
    if (wan >= 1) {
      return `¥${wan.toFixed(1)}万`;
    }
    return `¥${amount.toFixed(0)}`;
  };

  // Tab 配置
  const tabItems = [
    // 管理员视角 Tab
    ...(isAdmin
      ? [
          {
            key: 'all-tasks' as TabKey,
            label: (
              <span className={styles.tabLabel}>
                <TeamOutlined />
                所有催收任务
                {counts.allTasks > 0 && (
                  <Badge count={counts.allTasks} className={styles.tabBadge} />
                )}
              </span>
            ),
            children: <AllCollectionTasks onViewDetail={handleViewDetail} />,
          },
          {
            key: 'pre-warning' as TabKey,
            label: (
              <span className={styles.tabLabel}>
                <WarningOutlined />
                逾期前预警
                {(counts.preWarn2 + counts.preWarn5) > 0 && (
                  <Badge
                    count={counts.preWarn2 + counts.preWarn5}
                    className={styles.tabBadgeWarning}
                  />
                )}
              </span>
            ),
            children: <PreWarningList onViewDetail={handleViewDetail} />,
          },
        ]
      : []),
    // 通用 Tab
    {
      key: 'collection' as TabKey,
      label: (
        <span className={styles.tabLabel}>
          <BellOutlined />
          我的催收
          {counts.collection > 0 && (
            <Badge count={counts.collection} className={styles.tabBadge} />
          )}
        </span>
      ),
      children: (
        <CustomerTaskList
          onTaskClick={handleTaskClick}
          onViewDetail={handleViewDetail}
          onRefresh={handleRefreshCounts}
        />
      ),
    },
    {
      key: 'review' as TabKey,
      label: (
        <span className={styles.tabLabel}>
          <AuditOutlined />
          待审核
          {counts.review > 0 && (
            <Badge count={counts.review} className={styles.tabBadge} />
          )}
        </span>
      ),
      children: <ReviewTaskList onViewDetail={handleViewDetail} />,
    },
    {
      key: 'history' as TabKey,
      label: (
        <span className={styles.tabLabel}>
          <HistoryOutlined />
          已处理
        </span>
      ),
      children: <HistoryList onViewDetail={handleViewDetail} />,
    },
  ];

  return (
    <WorkspaceContext.Provider value={{ isMobile }}>
      <div className={styles.workspace}>
      {/* 页面头部 */}
      <div className={styles.header}>
        <h1 className={styles.title}>
          催收与审核工作台
          {isAdmin && <span className={styles.adminBadge}>管理员视角</span>}
        </h1>
        <p className={styles.subtitle}>
          {isAdmin ? '全局查看催收任务和逾期预警数据' : '处理应收账款催收任务和审核申请'}
        </p>
      </div>

      {/* 待办统计卡片 */}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} className={styles.statsRow}>
          {/* 管理员显示预警统计 */}
          {isAdmin && (
            <>
              <Col xs={12} sm={6}>
                <Card
                  className={`${styles.statCard} ${styles.statCardWarning} ${styles.statValueWarning} ${styles.statClickable}`}
                  onClick={() => handleStatCardClick('pre-warning')}
                >
                  <Statistic
                    title="逾期前预警"
                    value={counts.preWarn5 + counts.preWarn2}
                    prefix={<WarningOutlined />}
                  />
                  <div className={styles.statClickHint}>点击查看 →</div>
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card
                  className={`${styles.statCard} ${styles.statCardInfo} ${styles.statValueInfo} ${styles.statClickable}`}
                  onClick={() => handleStatCardClick('all-tasks')}
                >
                  <Statistic
                    title="总催收任务"
                    value={counts.allTasks}
                    prefix={<TeamOutlined />}
                  />
                  <div className={styles.statClickHint}>点击查看 →</div>
                </Card>
              </Col>
            </>
          )}
          <Col xs={12} sm={isAdmin ? 6 : 8}>
            <Card
              className={`${styles.statCard} ${counts.collection > 0 ? styles.statValueDanger : styles.statValueDefault} ${styles.statClickable}`}
              onClick={() => handleStatCardClick('collection')}
            >
              <Statistic
                title="待催收任务"
                value={counts.collection}
                prefix={<BellOutlined />}
              />
              {counts.collection > 0 && (
                <div className={styles.warningText}>
                  <ExclamationCircleOutlined />
                  有 {counts.collection} 个任务待处理
                </div>
              )}
              <div className={styles.statClickHint}>点击处理 →</div>
            </Card>
          </Col>
          <Col xs={12} sm={isAdmin ? 6 : 8}>
            <Card
              className={`${styles.statCard} ${counts.review > 0 ? styles.statValueWarning : styles.statValueDefault} ${styles.statClickable}`}
              onClick={() => handleStatCardClick('review')}
            >
              <Statistic
                title="待审核任务"
                value={counts.review}
                prefix={<AuditOutlined />}
              />
              {counts.review > 0 && (
                <div className={styles.warningText}>
                  <ExclamationCircleOutlined />
                  有 {counts.review} 个审核待处理
                </div>
              )}
              <div className={styles.statClickHint}>点击审核 →</div>
            </Card>
          </Col>
          {!isAdmin && (
            <Col xs={24} sm={8}>
              <Card className={`${styles.statCard} ${styles.statValueDefault}`}>
                <Statistic
                  title="已处理记录"
                  value={counts.history}
                  prefix={<HistoryOutlined />}
                />
              </Card>
            </Col>
          )}
        </Row>
      </Spin>

      {/* Tab 内容区 */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={tabItems}
        className={styles.tabs}
        tabPosition="top"
        animated={{ inkBar: true, tabPane: true }}
        tabBarStyle={{
          background: '#fff',
          borderRadius: '12px 12px 0 0',
          marginBottom: 0,
          padding: '0 16px',
        }}
      />

      {/* 催收弹窗 */}
      <CustomerCollectionModal
        task={currentTask}
        visible={collectionModalVisible}
        onCancel={() => {
          setCollectionModalVisible(false);
          setInitialAction(undefined);
        }}
        onSuccess={handleCollectionSuccess}
        isMobile={isMobile}
        initialAction={initialAction}
      />

      {/* 任务详情抽屉 */}
      <TaskDetail
        arId={detailArId}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
      />
      </div>
    </WorkspaceContext.Provider>
  );
};

export default Workspace;
