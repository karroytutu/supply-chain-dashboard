/**
 * 最近更新卡片组件
 * 展示 changelog 中最近 3 个版本的更新摘要，点击可跳转更新日志页
 */

import React, { useState, useEffect } from 'react';
import { Tag, Skeleton, Typography, Button } from 'antd';
import { RightOutlined, HistoryOutlined } from '@ant-design/icons';
import { history } from 'umi';
import request from '@/services/api/request';
import styles from './RecentUpdates.less';

const { Text } = Typography;

/** 变更类型配置：中文标签 + 颜色 */
const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  feature: { label: '新功能', color: '#52c41a' },
  fix: { label: '修复', color: '#faad14' },
  optimization: { label: '优化', color: '#1890ff' },
  breaking: { label: '重要变更', color: '#ff4d4f' },
};

interface ChangelogEntry {
  version: string;
  date: string;
  types: string[];
  changes: string[];
}

const MAX_ENTRIES = 3;

const RecentUpdates: React.FC = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    request<{ entries: ChangelogEntry[] }>('/changelog')
      .then((data) => setEntries((data.entries || []).slice(0, MAX_ENTRIES)))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  // 失败或无数据时静默不展示
  if (failed || (!loading && entries.length === 0)) {
    return null;
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <HistoryOutlined className={styles.titleIcon} />
          <span className={styles.title}>最近更新</span>
        </div>
        <Button
          type="link"
          size="small"
          onClick={() => history.push('/system/changelog')}
        >
          查看全部 <RightOutlined />
        </Button>
      </div>

      {loading ? (
        <div className={styles.skeleton}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} active paragraph={{ rows: 1 }} title={{ width: '40%' }} />
          ))}
        </div>
      ) : (
        <div className={styles.body}>
          {entries.map((entry) => (
            <div key={entry.version} className={styles.entry}>
              <div className={styles.meta}>
                <Tag color="blue" className={styles.versionTag}>{entry.version}</Tag>
                <Text type="secondary" className={styles.date}>
                  {entry.date.split(' ')[0]}
                </Text>
                <span className={styles.typeTags}>
                  {entry.types.map((type) => {
                    const cfg = TYPE_CONFIG[type];
                    return cfg ? (
                      <Tag key={type} color={cfg.color} className={styles.typeTag}>
                        {cfg.label}
                      </Tag>
                    ) : null;
                  })}
                </span>
              </div>
              <ul className={styles.changeList}>
                {entry.changes.map((change, idx) => (
                  <li key={idx} className={styles.changeItem}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentUpdates;
