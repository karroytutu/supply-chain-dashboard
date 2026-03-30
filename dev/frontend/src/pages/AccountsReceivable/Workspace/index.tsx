/**
 * 催收与审核工作台主页面
 * 包含多个Tab：所有催收任务、逾期前预警、我的催收、待审核、已处理
 * 管理员视角显示额外Tab
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Badge, Card, Statistic, Row, Col, Spin } from 'antd';
import {
  BellOutlined,
  AuditOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import {
  getMyTasks,
  getReviewTasks,
  getHistoryRecords,
  getAllTasks,
  getPreWarningData,
} from '@/services/api/accounts-receivable';
import useAuth from '@/models/auth';
import CollectionTaskList from './components/CollectionTaskList';
import ReviewTaskList from './components/ReviewTaskList';
import HistoryList from './components/HistoryList';
import CollectionModal from './components/CollectionModal';
import TaskDetail from './components/TaskDetail';
import AllCollectionTasks from './components/AllCollectionTasks';
import PreWarningList from './components/PreWarningList';
import styles from './index.less';

type TabKey = 'all-tasks' | 'pre-warning' | 'collection' | 'review' | 'history';

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
  });
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 催收弹窗状态
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [currentTask, setCurrentTask] = useState<ArCollectionTask | null>(null);

  // 详情抽屉状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailArId, setDetailArId] = useState<number | null>(null);

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 加载待办统计
  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        getMyTasks({ page: 1, pageSize: 1 }),
        getReviewTasks({ page: 1, pageSize: 1 }),
        getHistoryRecords({ page: 1, pageSize: 1 }),
      ];

      // 管理员加载额外统计
      if (isAdmin) {
        promises.push(getAllTasks({ page: 1, pageSize: 1 }));
        promises.push(getPreWarningData());
      }

      const results = await Promise.all(promises);

      const newCounts = {
        collection: results[0].total,
        review: results[1].total,
        history: results[2].total,
        allTasks: isAdmin ? results[3].total : 0,
        preWarn2: isAdmin ? results[4].preWarn2Count : 0,
        preWarn5: isAdmin ? results[4].preWarn5Count : 0,
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

  // 打开催收弹窗
  const handleTaskClick = (task: ArCollectionTask) => {
    setCurrentTask(task);
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
        <CollectionTaskList
          onTaskClick={handleTaskClick}
          onViewDetail={handleViewDetail}
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
                <Card className={`${styles.statCard} ${styles.statCardWarning}`}>
                  <Statistic
                    title="逾期前5天预警"
                    value={counts.preWarn5}
                    prefix={<WarningOutlined />}
                    valueStyle={{ color: '#faad14' }}
                  />
                  <div className={styles.statDesc}>即将在5天后到期</div>
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card className={`${styles.statCard} ${styles.statCardDanger}`}>
                  <Statistic
                    title="逾期前2天预警"
                    value={counts.preWarn2}
                    prefix={<WarningOutlined />}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                  <div className={styles.statDesc}>即将在2天后到期</div>
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card className={`${styles.statCard} ${styles.statCardInfo}`}>
                  <Statistic
                    title="总催收任务"
                    value={counts.allTasks}
                    prefix={<TeamOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                  <div className={styles.statDesc}>所有进行中的任务</div>
                </Card>
              </Col>
            </>
          )}
          <Col xs={12} sm={isAdmin ? 6 : 8}>
            <Card className={styles.statCard}>
              <Statistic
                title="待催收任务"
                value={counts.collection}
                prefix={<BellOutlined />}
                valueStyle={{ color: counts.collection > 0 ? '#ff4d4f' : '#262626' }}
              />
              {counts.collection > 0 && (
                <div className={styles.warningText}>
                  <ExclamationCircleOutlined />
                  有 {counts.collection} 个任务待处理
                </div>
              )}
            </Card>
          </Col>
          <Col xs={12} sm={isAdmin ? 6 : 8}>
            <Card className={styles.statCard}>
              <Statistic
                title="待审核任务"
                value={counts.review}
                prefix={<AuditOutlined />}
                valueStyle={{ color: counts.review > 0 ? '#faad14' : '#262626' }}
              />
              {counts.review > 0 && (
                <div className={styles.warningText}>
                  <ExclamationCircleOutlined />
                  有 {counts.review} 个审核待处理
                </div>
              )}
            </Card>
          </Col>
          {!isAdmin && (
            <Col xs={24} sm={8}>
              <Card className={styles.statCard}>
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
      <Card className={styles.tabCard}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          items={tabItems}
          className={styles.tabs}
          tabPosition={isMobile ? 'top' : 'left'}
        />
      </Card>

      {/* 催收弹窗 */}
      <CollectionModal
        task={currentTask}
        visible={collectionModalVisible}
        onCancel={() => setCollectionModalVisible(false)}
        onSuccess={handleCollectionSuccess}
        isMobile={isMobile}
      />

      {/* 任务详情抽屉 */}
      <TaskDetail
        arId={detailArId}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
      />
    </div>
  );
};

export default Workspace;
