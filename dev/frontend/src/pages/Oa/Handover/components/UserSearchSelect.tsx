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

  const handleSearch = useCallback((keyword: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (!keyword || keyword.length < 1) {
      setOptions([]);
      return;
    }

    fetchRef.current += 1;
    const fetchId = fetchRef.current;
    setFetching(true);

    debounceTimeout.current = setTimeout(async () => {
      try {
        const users = await searchHandoverUsers(keyword);
        if (fetchId !== fetchRef.current) return; // 过期请求
        setOptions(users);
      } catch {
        setOptions([]);
      } finally {
        setFetching(false);
      }
    }, 300);
  }, []);

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
