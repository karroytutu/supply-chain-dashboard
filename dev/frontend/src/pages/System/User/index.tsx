/**
 * 用户管理页面
 */
import { useState, useMemo } from 'react';
import { Card } from 'antd';
import { useUsers } from './hooks/useUsers';
import { UserStats } from './components/UserStats';
import { UserFilters } from './components/UserFilters';
import { BatchActionBar } from './components/BatchActionBar';
import { UserTable } from './components/UserTable';
import { RoleAssignModal } from './components/RoleAssignModal';
import styles from './index.less';
import type { UserItem } from './types';

export default function UserManage() {
  // 使用自定义 Hook 管理数据
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

  // 分配角色弹窗状态
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [batchRoleMode, setBatchRoleMode] = useState(false);

  // 打开单个用户分配角色弹窗
  const openAssignModal = (user: UserItem) => {
    setCurrentUser(user);
    setBatchRoleMode(false);
    setRoleModalVisible(true);
  };

  // 打开批量分配角色弹窗
  const openBatchAssignModal = () => {
    setCurrentUser(null);
    setBatchRoleMode(true);
    setRoleModalVisible(true);
  };

  // 确认分配角色
  const handleRoleConfirm = async (roleIds: number[]) => {
    if (batchRoleMode) {
      await handleBatchAssignRoles(roleIds);
    } else if (currentUser) {
      // 单个用户分配角色
      const { assignUserRoles } = await import('@/services/api/auth');
      await assignUserRoles(currentUser.id, roleIds);
    }
    setRoleModalVisible(false);
  };

  // 全选状态
  const allChecked = useMemo(() => {
    return dataSource.length > 0 && selectedRowKeys.length === dataSource.length;
  }, [dataSource, selectedRowKeys]);

  // 全选切换
  const handleCheckAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(dataSource.map(u => u.id));
    } else {
      setSelectedRowKeys([]);
    }
  };

  return (
    <div className={styles.container}>
      {/* 统计卡片 */}
      <UserStats
        stats={stats}
        activeStatus={activeStatus}
        onStatusClick={setActiveStatus}
      />

      {/* 主内容区 */}
      <Card>
        {/* 搜索筛选 */}
        <UserFilters
          filters={filters}
          roles={roles}
          onFilterChange={setFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />

        {/* 批量操作栏 */}
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

        {/* 用户表格 */}
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
