/**
 * 资产搜索选择器组件
 * 输入关键词搜索舟谱资产，选中后回填资产信息
 */
import React, { useState, useCallback } from 'react';
import { Select, Spin } from 'antd';
import { searchErpAssets } from '@/services/api/asset';
import type { ErpAsset } from '@/types/asset';

interface AssetSelectProps {
  value?: number;
  onChange?: (assetId: number, asset: ErpAsset | null) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const AssetSelect: React.FC<AssetSelectProps> = ({ value, onChange, placeholder, style }) => {
  const [assets, setAssets] = useState<ErpAsset[]>([]);
  const [fetching, setFetching] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const handleSearch = useCallback(async (keyword: string) => {
    if (!keyword || keyword.length < 1) {
      setAssets([]);
      return;
    }
    setFetching(true);
    try {
      const result = await searchErpAssets(keyword);
      setAssets(result || []);
    } catch {
      setAssets([]);
    } finally {
      setFetching(false);
    }
  }, []);

  const handleChange = (assetId: number) => {
    const asset = assets.find(a => a.id === assetId) || null;
    onChange?.(assetId, asset);
    setSearchValue('');
  };

  return (
    <Select
      showSearch
      value={value}
      placeholder={placeholder || '输入关键词搜索资产'}
      style={style || { width: '100%' }}
      defaultActiveFirstOption={false}
      filterOption={false}
      onSearch={(val) => { setSearchValue(val); handleSearch(val); }}
      onChange={handleChange}
      notFoundContent={fetching ? <Spin size="small" /> : '无匹配资产'}
      searchValue={searchValue}
    >
      {assets.map(asset => (
        <Select.Option key={asset.id} value={asset.id}>
          {asset.code} - {asset.name} ({asset.usageStatusStr || ''})
        </Select.Option>
      ))}
    </Select>
  );
};

export default AssetSelect;
