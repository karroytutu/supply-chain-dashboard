/**
 * 预警面板组件
 */
import React from 'react';
import { Table, Empty, Select, Space } from 'antd';
import { AlertOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { WARNING_CONFIG, GROUP_CONFIG } from './constants';
import { getColumns } from './columns';
import { useWarningData } from './useWarningData';
import styles from './index.less';

interface WarningPanelProps {
  stockWarnings: { outOfStock: number; lowStock: number };
  turnoverWarnings: { mildOverstock: number; moderateOverstock: number; seriousOverstock: number };
  expiringWarnings: { within7Days: number; within15Days: number; within30Days: number };
  slowMovingWarnings: { mildSlowMoving: number; moderateSlowMoving: number; seriousSlowMoving: number };
}

const WarningPanel: React.FC<WarningPanelProps> = (props) => {
  const {
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
  } = useWarningData(props);

  const selectedConfig = selectedKey ? WARNING_CONFIG[selectedKey as keyof typeof WARNING_CONFIG] : null;

  if (totalWarnings === 0) {
    return (
      <div className={styles.warningPanel}>
        <div className={styles.emptyState}>
          <PauseCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
          <span className={styles.emptyText}>暂无预警</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.warningPanel}>
      {/* 头部 */}
      <div className={styles.panelHeader}>
        <AlertOutlined className={styles.alertIcon} />
        <span className={styles.panelTitle}>预警监控</span>
        <span className={styles.totalCount}>共 {totalWarnings} 项</span>
      </div>

      {/* 左右分栏主体 */}
      <div className={styles.panelBody}>
        {/* 左侧：预警分类 */}
        <div className={styles.sidebar}>
          <div className={styles.warningGroups}>
            {warningGroups.map(group => {
              const groupConfig = GROUP_CONFIG[group.key as keyof typeof GROUP_CONFIG];
              if (group.items.length === 0) return null;
              const groupTotal = group.items.reduce((s, item) => s + item.count, 0);
              return (
                <div key={group.key} className={styles.warningGroup}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupIcon} style={{ color: groupConfig.color }}>
                      {groupConfig.icon}
                    </span>
                    <span className={styles.groupTitle}>{groupConfig.title}</span>
                    <span className={styles.groupCount}>{groupTotal}</span>
                  </div>
                  <div className={styles.groupItems}>
                    {group.items.map(item => {
                      const config = WARNING_CONFIG[item.key as keyof typeof WARNING_CONFIG];
                      const isSelected = selectedKey === item.key;
                      return (
                        <div
                          key={item.key}
                          className={`${styles.warningItem} ${isSelected ? styles.selected : ''}`}
                          onClick={() => handleSelectedKeyChange(item.key)}
                        >
                          <span className={styles.itemDot} style={{ backgroundColor: config.color }} />
                          <span className={styles.itemLabel}>{config.label}</span>
                          <span className={styles.itemCount}>{item.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧商品明细 */}
        <div className={styles.content}>
          {selectedKey && selectedConfig && (
            <>
              <div className={styles.tableHeader}>
                <div className={styles.tableTitle}>
                  <span className={styles.titleBar} style={{ backgroundColor: selectedConfig.color }} />
                  {selectedConfig.label}商品明细
                  <span className={styles.productCount}>{pagination.total}</span>
                </div>
                <div className={styles.filterBar}>
                  <Space>
                    <span>战略等级：</span>
                    <Select
                      value={strategicLevelFilter}
                      onChange={handleStrategicLevelChange}
                      style={{ width: 120 }}
                      allowClear
                      placeholder="全部"
                    >
                      <Select.Option value="strategic">战略商品</Select.Option>
                      <Select.Option value="normal">普通商品</Select.Option>
                    </Select>
                  </Space>
                </div>
              </div>
              <Table
                columns={getColumns(selectedKey)}
                dataSource={products}
                rowKey="productId"
                loading={loading}
                pagination={{
                  current: pagination.page,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100'],
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: handleTableChange,
                  size: 'small',
                }}
                scroll={{ x: 780 }}
                size="small"
                rowClassName={(record) => record.strategicLevel === 'strategic' ? styles.strategicRow : ''}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无商品数据" /> }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WarningPanel;
