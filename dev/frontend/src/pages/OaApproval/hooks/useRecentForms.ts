/**
 * 最近使用/常用表单 hook
 * 基于 localStorage 记录表单使用历史，提供快捷访问数据
 */
import { useState, useCallback } from 'react';
import type { FormCategory, FormTypeDefinition } from '@/types/oa-approval';

const STORAGE_KEY = 'oa_recent_forms';
const MAX_RECORDS = 20;

export interface FormUsageRecord {
  code: string;
  name: string;
  icon: string;
  category: FormCategory;
  version: number;
  lastUsedAt: number;
  useCount: number;
}

export interface QuickAccessItem {
  code: string;
  name: string;
  icon: string;
  category: FormCategory;
  version: number;
}

/** 从 localStorage 读取使用记录 */
function loadRecords(): FormUsageRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 写入 localStorage */
function saveRecords(records: FormUsageRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

interface UseRecentFormsReturn {
  quickAccessItems: QuickAccessItem[];
  recordUsage: (formType: FormTypeDefinition) => void;
}

export function useRecentForms(): UseRecentFormsReturn {
  const [records, setRecords] = useState<FormUsageRecord[]>(() => loadRecords());

  const recordUsage = useCallback((formType: FormTypeDefinition) => {
    setRecords((prev) => {
      const existing = prev.find((r) => r.code === formType.code);
      let next: FormUsageRecord[];

      if (existing) {
        next = prev.map((r) =>
          r.code === formType.code
            ? { ...r, lastUsedAt: Date.now(), useCount: r.useCount + 1 }
            : r,
        );
      } else {
        next = [
          ...prev,
          {
            code: formType.code,
            name: formType.name,
            icon: formType.icon,
            category: formType.category,
            version: formType.version,
            lastUsedAt: Date.now(),
            useCount: 1,
          },
        ];
      }

      // 按时间降序排列，保留上限
      next.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      if (next.length > MAX_RECORDS) {
        next = next.slice(0, MAX_RECORDS);
      }

      saveRecords(next);
      return next;
    });
  }, []);

  // 最近使用：按 lastUsedAt 降序，取前 4 项
  const recent = [...records]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, 4);

  // 常用表单：按 useCount 降序，取前 4 项（排除已在 recent 中的）
  const recentCodes = new Set(recent.map((r) => r.code));
  const frequent = [...records]
    .filter((r) => !recentCodes.has(r.code))
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 4);

  // 合并去重，最多 6 项
  const merged: QuickAccessItem[] = [
    ...recent.map(({ code, name, icon, category, version }) => ({ code, name, icon, category, version })),
    ...frequent.map(({ code, name, icon, category, version }) => ({ code, name, icon, category, version })),
  ].slice(0, 6);

  return { quickAccessItems: merged, recordUsage };
}
