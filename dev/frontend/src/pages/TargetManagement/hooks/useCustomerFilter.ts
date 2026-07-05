/**
 * 添加客户弹窗 - 筛选 Hook
 * 管理弹窗内的关键词搜索、片区/渠道/合作深度筛选
 */
import { useState, useMemo, useCallback } from 'react';
import { AREA_GROUP_ORDER } from '@/constants/areas';

type CustomerScope = 'all' | 'mine' | 'public';

export const SCOPE_OPTIONS = [
  { label: '全部', value: 'all' as CustomerScope },
  { label: '归属我的', value: 'mine' as CustomerScope },
  { label: '公海客户', value: 'public' as CustomerScope },
];

interface AvailableCustomer {
  customerId: number;
  customerName: string;
  consumerManagerName: string | null;
  channelName: string | null;
  areaName: string;
  cooperationTypeName: string | null;
  isPublicSea: boolean;
}

export function useCustomerFilter(availableCustomers: AvailableCustomer[], myCustomerIds: Set<number>) {
  const [keyword, setKeyword] = useState('');
  const [areaFilters, setAreaFilters] = useState<string[]>([]);
  const [channelFilters, setChannelFilters] = useState<string[]>([]);
  const [coopFilters, setCoopFilters] = useState<string[]>([]);
  const [scope, setScope] = useState<CustomerScope>('all');

  const areaTreeOptions = useMemo(() => {
    const groupMap = new Map<string, Set<string>>();
    for (const c of availableCustomers) {
      if (!c.areaName) continue;
      const prefix = AREA_GROUP_ORDER.find((p) => c.areaName!.startsWith(p)) || '其他';
      if (!groupMap.has(prefix)) groupMap.set(prefix, new Set());
      groupMap.get(prefix)!.add(c.areaName);
    }
    const orderedKeys = [
      ...AREA_GROUP_ORDER.filter((k) => groupMap.has(k)),
      ...[...groupMap.keys()].filter((k) => !AREA_GROUP_ORDER.includes(k)),
    ];
    return orderedKeys.map((group) => ({
      title: `${group}区域`,
      value: `__group__${group}`,
      key: `__group__${group}`,
      children: Array.from(groupMap.get(group)!).sort().map((a) => ({ title: a, value: a, key: a })),
    }));
  }, [availableCustomers]);

  const channelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of availableCustomers) { if (c.channelName) set.add(c.channelName); }
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [availableCustomers]);

  const coopOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of availableCustomers) { if (c.cooperationTypeName) set.add(c.cooperationTypeName); }
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [availableCustomers]);

  const filtered = useMemo(() => {
    let list = availableCustomers;
    if (scope === 'mine') list = list.filter((c) => myCustomerIds.has(c.customerId));
    else if (scope === 'public') list = list.filter((c) => c.isPublicSea);
    if (keyword) list = list.filter((c) => c.customerName.includes(keyword));
    if (areaFilters.length > 0) list = list.filter((c) => areaFilters.includes(c.areaName));
    if (channelFilters.length > 0) list = list.filter((c) => c.channelName && channelFilters.includes(c.channelName));
    if (coopFilters.length > 0) list = list.filter((c) => c.cooperationTypeName && coopFilters.includes(c.cooperationTypeName));
    return list;
  }, [availableCustomers, scope, myCustomerIds, keyword, areaFilters, channelFilters, coopFilters]);

  const resetFilters = useCallback(() => {
    setKeyword('');
    setAreaFilters([]);
    setChannelFilters([]);
    setCoopFilters([]);
    setScope('all');
  }, []);

  return {
    keyword, setKeyword,
    areaFilters, setAreaFilters, areaTreeOptions,
    channelFilters, setChannelFilters, channelOptions,
    coopFilters, setCoopFilters, coopOptions,
    scope, setScope,
    filtered, resetFilters,
  };
}
