/**
 * 表单管理列表页
 * @module pages/Oa/FormConfig
 *
 * 顶部分类 Tabs + 内联可编辑表格。
 * 支持常驻编辑图标编辑表单名称、分类、可发起岗位/人员、数据权限。
 */
import React, { useCallback, useMemo } from 'react';
import { Table, Input, Typography, Tabs, Button } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { history } from 'umi';
import type { FormTypeDefinition, FormCategory, ActiveCategory } from '@/types/oa';
import { CATEGORY_LABELS } from '@/types/oa';
import { useFormConfig } from './hooks/useFormConfig';
import { usePermissionDrawer } from './hooks/usePermissionDrawer';
import PermissionConfigDrawer from './components/PermissionConfigDrawer';
import styles from './index.less';

const { Title } = Typography;

const FormConfigPage: React.FC = () => {
  const {
    formTypes,
    loading,
    searchText,
    setSearchText,
    activeCategory,
    setActiveCategory,
    categoryCounts,
    roles,
    userMap,
    reload,
  } = useFormConfig();

  const { drawerVisible, currentRecord, openDrawer, closeDrawer, handleSave } =
    usePermissionDrawer(reload);

  /** 岗位编码→中文名映射 */
  const rolesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roles) map.set(r.code, r.name);
    return map;
  }, [roles]);

  /** 分类 Tabs 配置项 */
  const categoryTabItems = useMemo(() => {
    const allCats: ActiveCategory[] = ['all', 'finance', 'supply_chain', 'marketing', 'hr', 'admin'];
    const totalCount = Object.values(categoryCounts).reduce((sum, n) => sum + n, 0);
    return allCats.map((cat) => {
      const label = cat === 'all' ? '全部' : CATEGORY_LABELS[cat as FormCategory];
      const count = cat === 'all' ? totalCount : (categoryCounts[cat] || 0);
      return { key: cat, label: `${label} (${count})` };
    });
  }, [categoryCounts]);

  /** 保存内联编辑 */
  const handleSaveInline = useCallback(
    async (code: string, data: Record<string, unknown>) => {
      await reload(); // reload already called in usePermissionDrawer
    },
    [reload]
  );

  /** 渲染权限文字摘要 */
  const renderPermissionText = useCallback(
    (roleList?: string[] | null, userList?: number[] | null) => {
      if (!roleList?.length && !userList?.length) {
        return <span className={styles.permissionMuted}>不限制</span>;
      }
      const parts: string[] = [];
      if (roleList) parts.push(...roleList.map(code => rolesMap.get(code) || code));
      if (userList) parts.push(...userList.map(id => userMap.get(id) || `用户${id}`));
      const display = parts.slice(0, 3).join(', ');
      const extra = parts.length > 3 ? `, +${parts.length - 3}人` : '';
      return <span className={styles.permissionText}>{display}{extra}</span>;
    },
    [rolesMap, userMap]
  );

  const columns = [
    {
      title: '表单名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: FormTypeDefinition) => (
        <a onClick={() => history.push(`/oa/form-config/${record.code}?tab=workflow`)}>{name}</a>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (cat: FormCategory) => CATEGORY_LABELS[cat],
    },
    {
      title: '可发起',
      key: 'allowed',
      width: 250,
      render: (_: unknown, record: FormTypeDefinition) =>
        renderPermissionText(record.allowedRoles, record.allowedUsers),
    },
    {
      title: '数据权限',
      key: 'dataPerms',
      render: (_: unknown, record: FormTypeDefinition) => (
        <div>
          <span className={styles.permissionLabel}>查看:</span>
          {renderPermissionText(record.dataReadRoles, record.dataReadUsers)}
          <span className={styles.permissionDivider}>|</span>
          <span className={styles.permissionLabel}>导出:</span>
          {renderPermissionText(record.dataExportRoles, record.dataExportUsers)}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: FormTypeDefinition) => (
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => openDrawer(record)}
        >
          配置
        </Button>
      ),
    },
  ];

  return (
    <div className={`page-full ${styles.container}`}>
      <div className={styles.header}>
        <Title level={4} style={{ margin: 0 }}>表单管理</Title>
        <div style={{ flex: 1 }} />
        <Input
          placeholder="搜索表单名称"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
      </div>
      <div className={styles.categoryTabs}>
        <Tabs
          activeKey={activeCategory}
          onChange={(key) => setActiveCategory(key as ActiveCategory)}
          items={categoryTabItems}
          size="small"
        />
      </div>
      <div className={styles.listPanel}>
        <Table
          dataSource={formTypes}
          columns={columns}
          rowKey="code"
          loading={loading}
          pagination={false}
          size="middle"
        />
      </div>
      <PermissionConfigDrawer
        visible={drawerVisible}
        record={currentRecord}
        roles={roles}
        onClose={closeDrawer}
        onSave={handleSave}
      />
    </div>
  );
};

export default FormConfigPage;
