/**
 * 催收与审核工作台主页面
 * 包含三个Tab：我的催收、待审核、已处理
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Badge, Card, Statistic, Row, Col, Spin } from 'antd';
import {
  BellOutlined,
  AuditOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getMyTasks, getReviewTasks, getHistoryRecords } from '@/services/api/accounts-receivable';
import CollectionTaskList from './components/CollectionTaskList';
import ReviewTaskList from './components/ReviewTaskList';
import HistoryList from './components/HistoryList';
import CollectionModal from './components/CollectionModal';
import TaskDetail from './components/TaskDetail';
import styles from './index.less';

type TabKey = 'collection' | 'review' | 'history';

const Workspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('collection');
  const [counts, setCounts] = useState({
    collection: 0,
    review: 0,
    history: 0,
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
      const [collectionRes, reviewRes, historyRes] = await Promise.all([
        getMyTasks({ page: 1, pageSize: 1 }),
        getReviewTasks({ page: 1, pageSize: 1 }),
        getHistoryRecords({ page: 1, pageSize: 1 }),
      ]);
      setCounts({
        collection: collectionRes.total,
        review: reviewRes.total,
        history: historyRes.total,
      });
    } catch (error) {
      console.error('加载统计失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
        <h1 className={styles.title}>催收与审核工作台</h1>
        <p className={styles.subtitle}>处理应收账款催收任务和审核申请</p>
      </div>

      {/* 待办统计卡片 */}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} className={styles.statsRow}>
          <Col xs={12} sm={8}>
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
          <Col xs={12} sm={8}>
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
          <Col xs={24} sm={8}>
            <Card className={styles.statCard}>
              <Statistic
                title="已处理记录"
                value={counts.history}
                prefix={<HistoryOutlined />}
              />
            </Card>
          </Col>
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
