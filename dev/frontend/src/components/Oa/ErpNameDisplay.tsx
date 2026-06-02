/**
 * ERP ID → 名称 异步解析组件
 * 用于详情页将存储的 ERP ID 解析为可读标签
 */
import React, { useState, useEffect } from 'react';
import { Typography, Spin } from 'antd';
import { oaApi } from '@/services/api/oa';
import type { ErpReferenceType } from '@/services/api/oa';

const { Text } = Typography;

interface ErpNameDisplayProps {
  erpType: ErpReferenceType;
  id: unknown;
  /** 额外查询参数（如结算单需要 consumerId） */
  extraParams?: Record<string, string>;
}

const ErpNameDisplay: React.FC<ErpNameDisplayProps> = ({ erpType, id, extraParams }) => {
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !erpType) { setLoading(false); return; }

    let cancelled = false;
    oaApi.resolveErpNames(erpType, [Number(id)], extraParams)
      .then((data) => {
        if (cancelled) return;
        const matched = data.find((item) => item.id === Number(id));
        setName(matched?.label || String(id));
      })
      .catch(() => {
        if (!cancelled) setName(String(id));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [erpType, id, extraParams]);

  if (loading) return <Spin size="small" />;
  return <Text>{name || String(id)}</Text>;
};

export default ErpNameDisplay;
