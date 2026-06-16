import { useState, useEffect, useMemo } from 'react';
import { Timeline, Tag, Segmented, Input, Empty, Spin, Typography } from 'antd';
import request from '@/services/api/request';
import styles from './index.less';

const { Title, Text } = Typography;

/** 变更类型配置：中文标签 + 颜色 */
const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  feature: { label: '新功能', color: '#52c41a' },
  fix: { label: '修复', color: '#faad14' },
  optimization: { label: '优化', color: '#1890ff' },
  breaking: { label: '重要变更', color: '#ff4d4f' },
};

/** 类型优先级（用于确定 Timeline 圆点颜色） */
const TYPE_PRIORITY = ['breaking', 'feature', 'fix', 'optimization'];

interface ChangelogEntry {
  version: string;
  date: string;
  types: string[];
  changes: string[];
}

/** 获取条目中优先级最高的变更类型颜色 */
function getPrimaryColor(types: string[]): string {
  for (const t of TYPE_PRIORITY) {
    if (types.includes(t)) return TYPE_CONFIG[t]?.color || '#8c8c8c';
  }
  return '#8c8c8c';
}

/** 筛选选项 */
const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '新功能', value: 'feature' },
  { label: '修复', value: 'fix' },
  { label: '优化', value: 'optimization' },
  { label: '重要变更', value: 'breaking' },
];

export default function Changelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');

  // 加载更新日志数据（使用统一请求工具，自动携带认证 token）
  useEffect(() => {
    setLoading(true);
    request<{ entries: ChangelogEntry[] }>('/changelog')
      .then((data) => setEntries(data.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  // 按类型和关键词过滤
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // 类型过滤
      if (typeFilter !== 'all' && !entry.types.includes(typeFilter)) {
        return false;
      }
      // 关键词搜索（搜索版本号和变更描述）
      if (keyword) {
        const kw = keyword.toLowerCase();
        const matchVersion = entry.version.toLowerCase().includes(kw);
        const matchChanges = entry.changes.some((c) => c.toLowerCase().includes(kw));
        return matchVersion || matchChanges;
      }
      return true;
    });
  }, [entries, typeFilter, keyword]);

  return (
    <div className={styles.container}>
      {/* 页面标题 */}
      <div className={styles.header}>
        <Title level={4} style={{ marginBottom: 4 }}>更新日志</Title>
        <Text type="secondary">系统更新记录</Text>
      </div>

      {/* 筛选栏 */}
      <div className={styles.toolbar}>
        <Segmented
          options={FILTER_OPTIONS}
          value={typeFilter}
          onChange={(val) => setTypeFilter(val as string)}
        />
        <Input.Search
          placeholder="搜索更新内容"
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={setKeyword}
        />
      </div>

      {/* 内容区 */}
      <Spin spinning={loading}>
        {filteredEntries.length === 0 && !loading ? (
          <Empty description="暂无更新记录" />
        ) : (
          <Timeline
            items={filteredEntries.map((entry) => ({
              color: getPrimaryColor(entry.types),
              children: (
                <div>
                  {/* 日期时间 + 版本号 */}
                  <div style={{ marginBottom: 4 }}>
                    <Text strong>{entry.date.split(' ')[0]}</Text>
                    <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                      {entry.date.split(' ')[1] || ''}
                    </Text>
                    <Tag
                      style={{ marginLeft: 8, color: '#8c8c8c', borderColor: '#d9d9d9' }}
                    >
                      {entry.version}
                    </Tag>
                  </div>
                  {/* 变更描述列表 */}
                  {entry.changes.map((change, idx) => {
                    // 为每条变更分配颜色（根据该版本的类型列表轮流）
                    const typeKey = entry.types[idx % entry.types.length] || 'optimization';
                    const dotColor = TYPE_CONFIG[typeKey]?.color || '#8c8c8c';
                    return (
                      <div key={idx} className={styles.changeItem}>
                        <span
                          className={styles.changeDot}
                          style={{ backgroundColor: dotColor }}
                        />
                        <span>{change}</span>
                      </div>
                    );
                  })}
                </div>
              ),
            }))}
          />
        )}
      </Spin>
    </div>
  );
}
