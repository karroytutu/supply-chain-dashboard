/**
 * 预警数据管理 Hook
 */
import { useState, useEffect } from 'react';
import { getWarningProducts } from '@/services/api/dashboard';
import { warningTypeMap } from './constants';
import type { WarningProduct, StrategicLevel } from '@/types/warning';

interface WarningPanelProps {
  stockWarnings: { outOfStock: number; lowStock: number };
  turnoverWarnings: { mildOverstock: number; moderateOverstock: number; seriousOverstock: number };
  expiringWarnings: { within7Days: number; within15Days: number; within30Days: number };
  slowMovingWarnings: { mildSlowMoving: number; moderateSlowMoving: number; seriousSlowMoving: number };
}

export function useWarningData({
  stockWarnings,
  turnoverWarnings,
  expiringWarnings,
  slowMovingWarnings,
}: WarningPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [products, setProducts] = useState<WarningProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [strategicLevelFilter, setStrategicLevelFilter] = useState<StrategicLevel | undefined>();

  // 构建预警分组数据
  const warningGroups = [
    {
      key: 'stock',
      items: [
        { key: 'outOfStock', count: stockWarnings.outOfStock },
        { key: 'lowStock', count: stockWarnings.lowStock },
      ].filter(item => item.count > 0),
    },
    {
      key: 'overstock',
      items: [
        { key: 'mildOverstock', count: turnoverWarnings.mildOverstock },
        { key: 'moderateOverstock', count: turnoverWarnings.moderateOverstock },
        { key: 'seriousOverstock', count: turnoverWarnings.seriousOverstock },
      ].filter(item => item.count > 0),
    },
    {
      key: 'expiring',
      items: [
        { key: 'expiring7Days', count: expiringWarnings.within7Days },
        { key: 'expiring15Days', count: expiringWarnings.within15Days },
        { key: 'expiring30Days', count: expiringWarnings.within30Days },
      ].filter(item => item.count > 0),
    },
    {
      key: 'slowMoving',
      items: [
        { key: 'mildSlowMoving', count: slowMovingWarnings.mildSlowMoving },
        { key: 'moderateSlowMoving', count: slowMovingWarnings.moderateSlowMoving },
        { key: 'seriousSlowMoving', count: slowMovingWarnings.seriousSlowMoving },
      ].filter(item => item.count > 0),
    },
  ];

  // 计算总预警数
  const totalWarnings = warningGroups.reduce(
    (sum, group) => sum + group.items.reduce((s, item) => s + item.count, 0),
    0
  );

  // 默认选中第一个有数据的预警项
  useEffect(() => {
    if (!selectedKey && totalWarnings > 0) {
      for (const group of warningGroups) {
        if (group.items.length > 0) {
          setSelectedKey(group.items[0].key);
          break;
        }
      }
    }
  }, [totalWarnings]);

  // 根据选中项加载商品数据
  useEffect(() => {
    if (!selectedKey) {
      setProducts([]);
      setPagination(prev => ({ ...prev, total: 0 }));
      return;
    }

    const loadProducts = async () => {
      setLoading(true);
      try {
        const apiType = warningTypeMap[selectedKey];
        // 将战略等级筛选参数传给后端
        const result = await getWarningProducts(apiType, {
          page: pagination.page,
          pageSize: pagination.pageSize,
          strategicLevel: strategicLevelFilter,
        });

        setProducts(result.data || []);
        setPagination(prev => ({ ...prev, total: result.total || 0 }));
      } catch (error) {
        console.error('加载预警商品数据失败:', error);
        setProducts([]);
        setPagination(prev => ({ ...prev, total: 0 }));
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [selectedKey, pagination.page, pagination.pageSize, strategicLevelFilter]);

  // 切换预警类型时重置分页和筛选
  const handleSelectedKeyChange = (key: string) => {
    setSelectedKey(key);
    setPagination(prev => ({ ...prev, page: 1 }));
    setStrategicLevelFilter(undefined);
  };

  // 分页变化处理
  const handleTableChange = (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, page, pageSize }));
  };

  // 战略等级筛选变化
  const handleStrategicLevelChange = (value: StrategicLevel | undefined) => {
    setStrategicLevelFilter(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return {
    selectedKey,
    products,
    loading,
    pagination,
    strategicLevelFilter,
    warningGroups,
    totalWarnings,
    handleSelectedKeyChange,
    handleTableChange,
    handleStrategicLevelChange,
  };
}
