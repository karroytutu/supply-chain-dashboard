/**
 * 表单管理列表页
 * @module pages/Oa/FormConfig
 *
 * 顶部分类 Tabs + 内联可编辑表格。
 * 支持常驻编辑图标编辑表单名称、分类、可发起岗位/人员、数据权限。
 */
import React, { useCallback, useMemo } from 'react';
import { Table, Input, Typography, Tabs } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { history } from 'umi';
import type { FormTypeDefinition, FormCategory, ActiveCategory } from '@/types/oa';
import { CATEGORY_LABELS } from '@/types/oa';
import { useFormConfig } from './hooks/useFormConfig';
import InlineEditCell from './components/InlineEditCell';
import RoleUserSelect from './components/RoleUserSelect';
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
    inlineUpdate,
  } = useFormConfig();

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
  const handleSave = useCallback(
    async (code: string, data: Record<string, unknown>) => {
      await inlineUpdate(code, data);
    },
    [inlineUpdate]
  );

  /** 渲染岗位/人员展示（逗号分隔文字） */
  const renderRoleUserTags = (
    _record: FormTypeDefinition,
    roleList?: string[] | null,
    userList?: number[] | null
  ) => {
    if (!roleList?.length && !userList?.length) {
      return <span style={{ color: '#999' }}>不限制</span>;
    }
    const parts: string[] = [];
    if (roleList) parts.push(...roleList.map(code => rolesMap.get(code) || code));
    if (userList) parts.push(...userList.map(id => userMap.get(id) || `用户${id}`));
    return <span>{parts.join(', ')}</span>;
  };

  const columns = [
    {
      title: '表单名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: FormTypeDefinition) => (
        <InlineEditCell
          value={
            <span>
              <a onClick={() => history.push(`/oa/form-config/${record.code}?tab=workflow`)}>{name}</a>
            </span>
          }
          editType="text"
          editInitialValue={name}
          styles={styles}
          onSave={async (newName) => handleSave(record.code, { name: newName })}
        />
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (cat: FormCategory, record: FormTypeDefinition) => (
        <InlineEditCell
          value={CATEGORY_LABELS[cat]}
          editType="select"
          editInitialValue={cat}
          editProps={{
            options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
          }}
          styles={styles}
          onSave={async (newCat) => handleSave(record.code, { category: newCat })}
        />
      ),
    },
    {
      title: '可发起',
      key: 'allowed',
      width: 250,
      render: (_: unknown, record: FormTypeDefinition) => (
        <InlineEditCell
          value={renderRoleUserTags(record, record.allowedRoles, record.allowedUsers)}
          editType="role-user"
          styles={styles}
          editProps={{
            renderEditor: (onSave) => (
              <RoleUserSelect
                roles={roles}
                selectedRoles={record.allowedRoles || []}
                selectedUsers={record.allowedUsers || []}
                onChange={(newRoles, newUsers) =>
                  onSave({ allowedRoles: newRoles, allowedUsers: newUsers })
                }
                autoFocus
              />
            ),
          }}
          onSave={async (val: any) =>
            handleSave(record.code, {
              allowedRoles: val.allowedRoles,
              allowedUsers: val.allowedUsers,
            })
          }
        />
      ),
    },
    {
      title: '数据权限',
      key: 'dataPerms',
      render: (_: unknown, record: FormTypeDefinition) => (
        <div>
          <div className={styles.permissionSummary}>
            <span className={styles.permissionLabel}>查看:</span>
            <InlineEditCell
              value={renderRoleUserTags(record, record.dataReadRoles, record.dataReadUsers)}
              editType="role-user"
              styles={styles}
              editProps={{
                renderEditor: (onSave) => (
                  <RoleUserSelect
                    roles={roles}
                    selectedRoles={record.dataReadRoles || []}
                    selectedUsers={record.dataReadUsers || []}
                    onChange={(newRoles, newUsers) =>
                      onSave({ dataReadRoles: newRoles, dataReadUsers: newUsers })
                    }
                    autoFocus
                  />
                ),
              }}
              onSave={async (val: any) =>
                handleSave(record.code, {
                  dataReadRoles: val.dataReadRoles,
                  dataReadUsers: val.dataReadUsers,
                })
              }
            />
          </div>
          <div className={styles.permissionSummary} style={{ marginTop: 4 }}>
            <span className={styles.permissionLabel}>导出:</span>
            <InlineEditCell
              value={renderRoleUserTags(record, record.dataExportRoles, record.dataExportUsers)}
              editType="role-user"
              styles={styles}
              editProps={{
                renderEditor: (onSave) => (
                  <RoleUserSelect
                    roles={roles}
                    selectedRoles={record.dataExportRoles || []}
                    selectedUsers={record.dataExportUsers || []}
                    onChange={(newRoles, newUsers) =>
                      onSave({ dataExportRoles: newRoles, dataExportUsers: newUsers })
                    }
                    autoFocus
                  />
                ),
              }}
              onSave={async (val: any) =>
                handleSave(record.code, {
                  dataExportRoles: val.dataExportRoles,
                  dataExportUsers: val.dataExportUsers,
                })
              }
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
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
    </div>
  );
};

export default FormConfigPage;
