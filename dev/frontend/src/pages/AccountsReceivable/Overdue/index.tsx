/**
 * 逾期管理总览页面
 * 展示逾期应收账款的管理总览，包括统计卡片、流程状态、任务列表
 */
import React, { useState } from 'react';
import { Spin, Tabs, Button, message } from 'antd';
import { SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { useOverdueStats } from './hooks/useOverdueStats';
import { PERMISSIONS } from '@/constants/permissions';
import { usePermission } from '@/hooks/usePermission';
import OverdueStatsCards from './components/OverdueStatsCards';
import FlowStatusPanel from './components/FlowStatusPanel';
import PreprocessingList from './components/PreprocessingList';
import AssignmentList from './components/AssignmentList';
import CollectingList from './components/CollectingList';
import TimeoutWarningList from './components/TimeoutWarningList';
import DeadlineConfigModal from './components/DeadlineConfigModal';
import styles from './index.less';

const { TabPane } = Tabs;

type TabKey = 'preprocessing' | 'assignment' | 'collecting' | 'timeout';

const OverdueManagement: React.FC = () => {
  const { hasPermission } = usePermission();
  const { stats, loading, refresh } = useOverdueStats();
  const [activeTab, setActiveTab] = useState<TabKey>('preprocessing');
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const canConfig = hasPermission(PERMISSIONS.FINANCE.AR.OVERDUE.CONFIG);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
    message.success('数据已刷新');
  };

  const handleTimeoutClick = () => {
    setActiveTab('timeout');
  };

  const handleFlowTabChange = (tab: string) => {
    if (tab === 'preprocessing') setActiveTab('preprocessing');
    else if (tab === 'assignment') setActiveTab('assignment');
    else if (tab === 'collecting') setActiveTab('collecting');
    else if (tab === 'review') setActiveTab('collecting');
  };

  if (loading && !stats) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div className={styles.overduePage}>
      {/* 页面头部 */}
      <div className={styles.pageHeader}>
        <h3>逾期管理</h3>
        <div className={styles.headerActions}>
          <Button
            icon={<SyncOutlined spin={refreshing} />}
            loading={refreshing}
            onClick={handleRefresh}
            style={{ marginRight: 8 }}
          >
            刷新
          </Button>
          {canConfig && (
            <Button
              type="primary"
              ghost
              icon={<SettingOutlined />}
              onClick={() => setConfigModalVisible(true)}
            >
              时限配置
            </Button>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <OverdueStatsCards
        stats={stats}
        onTimeoutClick={handleTimeoutClick}
      />

      {/* 流程状态面板 */}
      <FlowStatusPanel
        flowStatus={stats?.flowStatus}
        activeTab={activeTab === 'timeout' ? '' : activeTab}
        onTabChange={handleFlowTabChange}
      />

      {/* Tab 列表区域 */}
      <div className={styles.tabsContainer}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          type="card"
        >
          <TabPane
            tab={`待预处理 (${stats?.flowStatus?.preprocessingPending || 0})`}
            key="preprocessing"
          >
            <PreprocessingList onRefreshStats={refresh} />
          </TabPane>
          <TabPane
            tab={`待分配 (${stats?.flowStatus?.assignmentPending || 0})`}
            key="assignment"
          >
            <AssignmentList onRefreshStats={refresh} />
          </TabPane>
          <TabPane
            tab={`催收中 (${stats?.flowStatus?.collecting || 0})`}
            key="collecting"
          >
            <CollectingList onRefreshStats={refresh} />
          </TabPane>
          <TabPane
            tab={
              <span style={{ color: stats?.timeoutWarningCount ? '#ff4d4f' : undefined }}>
                超时预警 ({stats?.timeoutWarningCount || 0})
              </span>
            }
            key="timeout"
          >
            <TimeoutWarningList onRefreshStats={refresh} />
          </TabPane>
        </Tabs>
      </div>

      {/* 时限配置弹窗 */}
      <DeadlineConfigModal
        visible={configModalVisible}
        onCancel={() => setConfigModalVisible(false)}
      />
    </div>
  );
};

export default OverdueManagement;
