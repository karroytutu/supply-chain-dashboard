/**
 * 组织架构页面
 * 左侧部门树 + 右侧详情面板
 */
import DeptTree from './components/DeptTree';
import OrgDetailPanel from './components/OrgDetailPanel';
import { useOrgData } from './hooks/useOrgData';
import styles from './index.less';

export default function OrgStructure() {
  const {
    deptTree,
    treeLoading,
    selected,
    deptUsers,
    deptUsersLoading,
    supervisor,
    subordinates,
    userDetailLoading,
    selectDept,
    selectUser,
  } = useOrgData();

  return (
    <div className={styles.orgContainer}>
      <div className={styles.deptTreePanel}>
        <div className={styles.treeTitle}>部门架构</div>
        <DeptTree
          treeData={deptTree}
          loading={treeLoading}
          onSelect={selectDept}
        />
      </div>
      <div className={styles.detailPanel}>
        <OrgDetailPanel
          selected={selected}
          deptUsers={deptUsers}
          deptUsersLoading={deptUsersLoading}
          supervisor={supervisor}
          subordinates={subordinates}
          userDetailLoading={userDetailLoading}
          onSelectUser={selectUser}
        />
      </div>
    </div>
  );
}