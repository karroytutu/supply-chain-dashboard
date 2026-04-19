/**
 * 用户管理页面
 * Tab 布局：用户列表 + 钉钉同步
 */
import { useState, useMemo } from 'react';
import { Card, Tabs } from 'antd';
import { TeamOutlined, SyncOutlined } from '@ant-design/icons';
import { useUsers } from './hooks/useUsers';
import { useDingtalkSync } from './hooks/useDingtalkSync';
import { UserStats } from './components/UserStats';
import { UserFilters } from './components/UserFilters';
import { BatchActionBar } from './components/BatchActionBar';
import { UserTable } from './components/UserTable';
import { RoleAssignModal } from './components/RoleAssignModal';
import { SyncStatusCard } from './components/SyncStatusCard';
import { SyncLogTable } from './components/SyncLogTable';
import { SyncLogDetail } from './components/SyncLogDetail';
import styles from './index.less';
import type { UserItem } from './types';

export default function UserManage() {
  const [activeTab, setActiveTab] = useState('users');

  // 用户列表数据
  const {
    loading,
    dataSource,
    total,
    page,
    pageSize,
    stats,
    selectedRowKeys,
    batchLoading,
    roles,
    filters,
    activeStatus,
    setFilters,
    setActiveStatus,
    setSelectedRowKeys,
    handleSearch,
    handleReset,
    handlePageChange,
    handleToggleStatus,
    handleBatchEnable,
    handleBatchDisable,
    handleBatchAssignRoles,
  } = useUsers();

  // 钉钉同步数据
  const {
    syncStatus,
    logs,
    logsTotal,
    logsPage,
    logsPageSize,
    loading: logsLoading,
    syncing,
    logStatusFilter,
    logTypeFilter,
    handleTriggerFullSync,
    handleLogsPageChange,
    setLogStatusFilter,
    setLogTypeFilter,
    detailLog,
    setDetailLog,
  } = useDingtalkSync();

  // 分配角色弹窗状态
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [batchRoleMode, setBatchRoleMode] = useState(false);

  const openAssignModal = (user: UserItem) => {
    setCurrentUser(user);
    setBatchRoleMode(false);
    setRoleModalVisible(true);
  };

  const openBatchAssignModal = () => {
    setCurrentUser(null);
    setBatchRoleMode(true);
    setRoleModalVisible(true);
  };

  const handleRoleConfirm = async (roleIds: number[]) => {
    if (batchRoleMode) {
      await handleBatchAssignRoles(roleIds);
    } else if (currentUser) {
      const { assignUserRoles } = await import('@/services/api/auth');
      await assignUserRoles(currentUser.id, roleIds);
    }
    setRoleModalVisible(false);
  };

  const allChecked = useMemo(() => {
    return dataSource.length > 0 && selectedRowKeys.length === dataSource.length;
  }, [dataSource, selectedRowKeys]);

  const handleCheckAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(dataSource.map(u => u.id));
    } else {
      setSelectedRowKeys([]);
    }
  };

  const tabItems = [
    {
      key: 'users',
      label: (
        <span>
          <TeamOutlined />
          用户列表
        </span>
      ),
      children: (
        <>
          <UserStats
            stats={stats}
            activeStatus={activeStatus}
            onStatusClick={setActiveStatus}
          />
          <Card>
            <UserFilters
              filters={filters}
              roles={roles}
              onFilterChange={setFilters}
              onSearch={handleSearch}
              onReset={handleReset}
            />
            <BatchActionBar
              selectedCount={selectedRowKeys.length}
              totalCount={dataSource.length}
              checked={allChecked}
              onCheckChange={handleCheckAll}
              onBatchEnable={handleBatchEnable}
              onBatchDisable={handleBatchDisable}
              onBatchAssignRoles={openBatchAssignModal}
              loading={batchLoading}
            />
            <UserTable
              dataSource={dataSource}
              loading={loading}
              total={total}
              page={page}
              pageSize={pageSize}
              selectedRowKeys={selectedRowKeys}
              onPageChange={handlePageChange}
              onSelectedRowKeysChange={setSelectedRowKeys}
              onAssignRoles={openAssignModal}
              onToggleStatus={handleToggleStatus}
            />
          </Card>
        </>
      ),
    },
    {
      key: 'sync',
      label: (
        <span>
          <SyncOutlined />
          钉钉同步
        </span>
      ),
      children: (
        <>
          <SyncStatusCard
            syncStatus={syncStatus}
            syncing={syncing}
            onTriggerFullSync={handleTriggerFullSync}
          />
          <Card title="同步日志">
            <SyncLogTable
              dataSource={logs}
              total={logsTotal}
              page={logsPage}
              pageSize={logsPageSize}
              loading={logsLoading}
              statusFilter={logStatusFilter}
              typeFilter={logTypeFilter}
              onPageChange={handleLogsPageChange}
              onStatusFilterChange={setLogStatusFilter}
              onTypeFilterChange={setLogTypeFilter}
              onRowClick={setDetailLog}
            />
          </Card>
          <SyncLogDetail
            visible={!!detailLog}
            log={detailLog}
            onClose={() => setDetailLog(null)}
          />
        </>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      {/* 角色分配弹窗 */}
      <RoleAssignModal
        visible={roleModalVisible}
        user={currentUser}
        users={batchRoleMode ? dataSource.filter(u => selectedRowKeys.includes(u.id)) : undefined}
        roles={roles}
        onConfirm={handleRoleConfirm}
        onCancel={() => setRoleModalVisible(false)}
        loading={batchLoading}
        mode={batchRoleMode ? 'batch' : 'single'}
      />
    </div>
  );
}
