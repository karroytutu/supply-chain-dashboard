/**
 * 弹窗控制 Hook
 * 封装弹窗开关状态和关联数据，减少重复代码
 */
import { useState, useCallback } from 'react';

export function useModalControl<T = any>() {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((record?: T) => {
    setData(record || null);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setData(null);
  }, []);

  return { visible, data, open, close };
}
