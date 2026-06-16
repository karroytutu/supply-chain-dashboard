import React, { useState, useCallback, useRef } from 'react';
import { Select, Spin } from 'antd';
import { searchHandoverUsers } from '@/services/api/oa';

interface UserOption {
  id: number;
  name: string;
}

interface UserSearchSelectProps {
  value?: number | undefined;
  onChange?: (value: number | undefined, label?: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const { Option } = Select;

const UserSearchSelect: React.FC<UserSearchSelectProps> = ({ value, onChange, placeholder = '搜索用户', style }) => {
  const [options, setOptions] = useState<UserOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const fetchRef = useRef(0);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout>>();
  // 标记是否已加载过初始列表，避免重复请求
  const initialLoadedRef = useRef(false);

  // 公共加载函数：复用于初始加载和搜索
  const fetchUsers = useCallback(async (keyword: string) => {
    fetchRef.current += 1;
    const fetchId = fetchRef.current;
    setFetching(true);

    try {
      const users = await searchHandoverUsers(keyword);
      if (fetchId !== fetchRef.current) return; // 过期请求
      setOptions(users);
    } catch {
      setOptions([]);
    } finally {
      if (fetchId === fetchRef.current) setFetching(false);
    }
  }, []);

  // 搜索处理（带 debounce）
  const handleSearch = useCallback((keyword: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (!keyword || keyword.trim().length < 1) {
      // 清除搜索词后，重新加载全部列表（而非清空）
      fetchUsers('');
      return;
    }

    debounceTimeout.current = setTimeout(() => {
      fetchUsers(keyword);
    }, 300);
  }, [fetchUsers]);

  // 下拉展开时加载初始列表（仅首次）
  const handleDropdownVisibleChange = useCallback((open: boolean) => {
    if (open && !initialLoadedRef.current) {
      initialLoadedRef.current = true;
      fetchUsers('');
    }
  }, [fetchUsers]);

  const handleChange = useCallback(
    (val: number | undefined) => {
      const selected = options.find(o => o.id === val);
      onChange?.(val, selected?.name);
    },
    [options, onChange]
  );

  return (
    <Select
      showSearch
      allowClear
      value={value}
      placeholder={placeholder}
      filterOption={false}
      onSearch={handleSearch}
      onChange={handleChange}
      onDropdownVisibleChange={handleDropdownVisibleChange}
      notFoundContent={fetching ? <Spin size="small" /> : '无匹配用户'}
      style={style}
    >
      {options.map(user => (
        <Option key={user.id} value={user.id}>
          {user.name}
        </Option>
      ))}
    </Select>
  );
};

export default UserSearchSelect;
