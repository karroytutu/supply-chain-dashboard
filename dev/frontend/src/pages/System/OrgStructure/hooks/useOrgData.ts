import { useState, useCallback, useEffect } from 'react';
import {
  getDeptTree,
  getDeptUsers,
  getSupervisor,
  getSubordinates,
  type DeptTreeNode,
  type DeptUserItem,
  type UserBrief,
} from '@/services/api/org';
import type { SelectedInfo } from '../types';

export function useOrgData() {
  const [deptTree, setDeptTree] = useState<DeptTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selected, setSelected] = useState<SelectedInfo>(null);

  // 部门用户
  const [deptUsers, setDeptUsers] = useState<DeptUserItem[]>([]);
  const [deptUsersLoading, setDeptUsersLoading] = useState(false);

  // 用户详情
  const [supervisor, setSupervisor] = useState<UserBrief | null>(null);
  const [subordinates, setSubordinates] = useState<UserBrief[]>([]);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  // 加载部门树
  const loadDeptTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const data = await getDeptTree();
      setDeptTree(data);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadDeptTree(); }, [loadDeptTree]);

  // 选中部门 → 加载该部门用户
  const selectDept = useCallback(async (dingtalkDeptId: string, name: string) => {
    setSelected({ type: 'dept', dingtalkDeptId, name });
    setDeptUsersLoading(true);
    setSupervisor(null);
    setSubordinates([]);
    try {
      const users = await getDeptUsers(dingtalkDeptId);
      setDeptUsers(users);
    } finally {
      setDeptUsersLoading(false);
    }
  }, []);

  // 选中用户 → 加载上级和下属
  const selectUser = useCallback(async (userId: number, name: string) => {
    setSelected({ type: 'user', userId, name });
    setUserDetailLoading(true);
    try {
      const [supResult, subResult] = await Promise.all([
        getSupervisor(userId),
        getSubordinates(userId),
      ]);
      setSupervisor(supResult.supervisor);
      setSubordinates(subResult.subordinates);
    } finally {
      setUserDetailLoading(false);
    }
  }, []);

  return {
    deptTree,
    treeLoading,
    selected,
    deptUsers,
    deptUsersLoading,
    supervisor,
    subordinates,
    userDetailLoading,
    loadDeptTree,
    selectDept,
    selectUser,
  };
}