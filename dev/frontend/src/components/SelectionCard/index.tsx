/**
 * 选择卡片公共组件
 * 支持多选、禁用项、Tooltip 提示
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckOutlined, LockOutlined } from '@ant-design/icons';
import styles from './index.less';
import type { SelectionCardProps } from './types';

function SelectionCard<T extends Record<string, any>>({
  dataSource,
  selectedKeys,
  onChange,
  config,
}: SelectionCardProps<T>) {
  const {
    rowKey,
    titleKey,
    descriptionKey,
    codeKey,
    tagKey,
    tagLabel = '系统角色',
    disabledKey,
    disabledTooltip = '系统角色不可修改，由系统自动分配',
    columns = 2,
    mode = 'multiple',
  } = config;

  const handleToggle = (item: T) => {
    const key = item[rowKey] as React.Key;
    const isDisabled = disabledKey?.(item);

    if (isDisabled) return;

    // 单选模式：直接替换为当前选中项（若已选中则取消）
    if (mode === 'single') {
      const newKey = selectedKeys.includes(key) ? [] : [key];
      onChange(newKey);
      return;
    }

    // 多选模式：原有逻辑
    const newSelectedKeys = selectedKeys.includes(key)
      ? selectedKeys.filter(k => k !== key)
      : [...selectedKeys, key];

    onChange(newSelectedKeys);
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${280 / columns}px, 1fr))`,
  };

  return (
    <div className={styles.cardGrid} style={gridStyle}>
      {dataSource.map(item => {
        const key = item[rowKey] as React.Key;
        const isSelected = selectedKeys.includes(key);
        const isDisabled = disabledKey?.(item) || false;

        const card = (
          <div
            key={key}
            className={`${styles.selectCard} ${isSelected ? styles.selected : ''} ${
              isDisabled ? styles.disabled : ''
            }`}
            onClick={() => handleToggle(item)}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardCheckbox}>
                {isDisabled ? (
                  <LockOutlined style={{ fontSize: 12, color: '#faad14' }} />
                ) : (
                  isSelected && <CheckOutlined style={{ fontSize: 12, color: '#1890ff' }} />
                )}
              </div>
              <span className={styles.cardTitle}>{item[titleKey]}</span>
              {isDisabled && <LockOutlined className={styles.lockIcon} />}
            </div>

            {(descriptionKey || codeKey) && (
              <div className={styles.cardDesc}>
                {codeKey && <Tag>{item[codeKey]}</Tag>}
                {descriptionKey && item[descriptionKey] && (
                  <span className={styles.descText}>{item[descriptionKey]}</span>
                )}
              </div>
            )}

            {tagKey && item[tagKey] && (
              <Tag color="red" className={styles.systemTag}>
                {tagLabel}
              </Tag>
            )}
          </div>
        );

        if (isDisabled) {
          return (
            <Tooltip key={key} title={disabledTooltip}>
              {card}
            </Tooltip>
          );
        }

        return card;
      })}
    </div>
  );
}

export default SelectionCard;

// 重新导出类型，方便使用
export type { SelectionCardProps, SelectionCardFieldConfig } from './types';
