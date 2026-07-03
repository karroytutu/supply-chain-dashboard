/**
 * 被考核人选择器数据 Hook
 * 调用 /api/assessment/users 获取有考核记录的人员列表
 * 使用 useRef 缓存首次加载结果，同一会话不重复请求
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { getAssessmentUsers } from '@/services/api/assessment';
import { createLogger } from '../../../utils/logger';
const log = createLogger('useAssessmentUsers');

interface AssessmentUser {
  id: number;
  name: string;
}

export function useAssessmentUsers() {
  const [users, setUsers] = useState<AssessmentUser[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<AssessmentUser[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // 组件卸载时清理 debounce 定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** 搜索被考核人（支持 debounce 300ms） */
  const searchUsers = useCallback((keyword?: string) => {
    // 清除之前的 debounce 定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      // 无关键词时返回缓存的完整列表
      if (!keyword && cacheRef.current) {
        setUsers(cacheRef.current);
        return;
      }

      setLoading(true);
      try {
        const result = await getAssessmentUsers(keyword);
        const list = result || [];
        setUsers(list);
        // 无关键词时缓存结果
        if (!keyword) {
          cacheRef.current = list;
        }
      } catch (error) {
        log.error('查询被考核人列表失败:', error);
        // API 失败时不阻塞页面，保持空列表
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return { users, loading, searchUsers };
}
