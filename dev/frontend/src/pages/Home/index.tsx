/**
 * 个人工作台首页
 * 展示待办事项、快捷操作，按业务模块分组
 */

import React, { useCallback } from 'react';
import { Spin, Result, Button } from 'antd';
import { history } from 'umi';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import GreetingBanner from './components/GreetingBanner';
import RecentUpdates from './components/RecentUpdates';
import SummaryBar from './components/SummaryBar';
import ModuleCard from './components/ModuleCard';
import QuickActions from './components/QuickActions';
import styles from './index.less';

const Home: React.FC = () => {
  const { data, loading, error, reload } = useWorkspaceData();

  const handleNavigate = useCallback((path: string) => {
    history.push(path);
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.page}>
        <Result
          status="error"
          title="加载失败"
          subTitle={error.message}
          extra={
            <Button type="primary" onClick={reload}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  const modules = data?.modules || [];
  const summary = data?.summary || null;

  return (
    <div className={styles.page}>
      <GreetingBanner pendingCount={summary?.totalPending || 0} />
      <RecentUpdates />
      <SummaryBar summary={summary} />

      <div className={styles.sectionTitle}>待办事项</div>
      {modules.length > 0 ? (
        <div className={styles.moduleGrid}>
          {modules.map((mod) => (
            <ModuleCard
              key={mod.code}
              module={mod}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          暂无待办事项
        </div>
      )}

      <div className={styles.sectionTitle}>快捷操作</div>
      <QuickActions onNavigate={handleNavigate} />
    </div>
  );
};

export default Home;
