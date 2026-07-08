import React, { useState, useEffect } from 'react';
import { Input, Button, List, Spin, Empty, Tag, Badge, Tooltip } from 'antd';
import { SearchOutlined, FilterOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { ApprovalStatusTag } from '@/components/Oa';
import type { ApprovalInstance, FormTypeDefinition, ViewMode } from '@/types/oa';
import type { Dayjs } from 'dayjs';
import FilterPanel, { ActiveFilterTags } from './FilterPanel';
import styles from '../index.less';

/** 格式化剩余/超时时长 */
function formatDeadlineDuration(ms: number): string {
  const absMs = Math.abs(ms);
  const totalMinutes = Math.floor(absMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;

  if (days > 0) return `${days}天${remainHours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

/** 超时标签组件 */
function TimeoutTag({ deadlineAt }: { deadlineAt: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadlineAt) return;
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, [deadlineAt]);

  if (!deadlineAt) return null;

  const now = Date.now();
  const deadline = new Date(deadlineAt).getTime();
  const diff = deadline - now;

  if (diff <= 0) {
    return (
      <Tag icon={<ClockCircleOutlined />} color="error">
        已超时 {formatDeadlineDuration(diff)}
      </Tag>
    );
  }

  return (
    <Tag icon={<ClockCircleOutlined />} color="processing">
      剩余 {formatDeadlineDuration(diff)}
    </Tag>
  );
}

interface FilterProps {
  viewMode: ViewMode;
  formTypeCode: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  applicantName: string | null;
  activeFilterCount: number;
  filterOpen: boolean;
  formTypes: FormTypeDefinition[];
  setFormTypeCode: (val: string | undefined) => void;
  setStatus: (val: string | undefined) => void;
  setDateRange: (dates: [Dayjs, Dayjs] | null) => void;
  setApplicantName: (val: string | undefined) => void;
  clearFilters: () => void;
  toggleFilterOpen: () => void;
}

interface ApprovalListProps {
  loading: boolean;
  list: ApprovalInstance[];
  total: number;
  page: number;
  searchText: string;
  selectedId: number | null;
  onSearchTextChange: (text: string) => void;
  onItemClick: (item: ApprovalInstance) => void;
  onPageChange: (page: number) => void;
  filterProps: FilterProps;
}

const ApprovalList: React.FC<ApprovalListProps> = ({
  loading, list, total, page, searchText, selectedId,
  onSearchTextChange, onItemClick, onPageChange,
  filterProps,
}) => {
  const {
    viewMode, formTypeCode, status, startDate, endDate, applicantName,
    activeFilterCount, filterOpen, formTypes,
    setFormTypeCode, setStatus, setDateRange, setApplicantName,
    clearFilters, toggleFilterOpen,
  } = filterProps;

  const hasActiveFilters = activeFilterCount > 0;

  const filterButton = (
    <Button
      icon={<FilterOutlined />}
      className={hasActiveFilters ? styles.filterBtnActive : undefined}
      onClick={hasActiveFilters ? clearFilters : toggleFilterOpen}
      aria-expanded={filterOpen}
      aria-label="筛选"
    >
      筛选
    </Button>
  );

  return (
    <div className={styles.listPanel}>
      <div className={styles.listHeader}>
        <Input
          className={styles.searchInput}
          placeholder="搜索流程..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          allowClear
        />
        {hasActiveFilters ? (
          <Tooltip title="点击清除全部筛选">
            <Badge count={activeFilterCount} size="small" offset={[-4, 0]}>
              {filterButton}
            </Badge>
          </Tooltip>
        ) : (
          filterButton
        )}
      </div>

      {filterOpen && (
        <FilterPanel
          viewMode={viewMode}
          formTypeCode={formTypeCode}
          status={status}
          startDate={startDate}
          endDate={endDate}
          applicantName={applicantName}
          formTypes={formTypes}
          setFormTypeCode={setFormTypeCode}
          setStatus={setStatus}
          setDateRange={setDateRange}
          setApplicantName={setApplicantName}
        />
      )}

      <ActiveFilterTags
        formTypeCode={formTypeCode}
        status={status}
        startDate={startDate}
        endDate={endDate}
        applicantName={applicantName}
        formTypes={formTypes}
        setFormTypeCode={setFormTypeCode}
        setStatus={setStatus}
        setDateRange={setDateRange}
        setApplicantName={setApplicantName}
      />

      <div className={styles.listContent}>
        {loading ? (
          <div className={styles.loadingContainer}><Spin /></div>
        ) : list.length === 0 ? (
          <Empty description={hasActiveFilters ? '没有符合条件的审批流程' : '暂无数据'} />
        ) : (
          <List
            dataSource={list}
            renderItem={(item) => (
              <div
                className={`${styles.listItem} ${selectedId === item.id ? styles.listItemActive : ''}`}
                onClick={() => onItemClick(item)}
              >
                <div className={styles.itemHeader}>
                  <span className={styles.itemTitle}>
                    {item.isUnread && (
                      <span style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#f5222d',
                        marginRight: 6,
                        verticalAlign: 'middle',
                      }} />
                    )}
                    {item.title}
                  </span>
                  <span className={styles.itemDate}>
                    {new Date(item.submittedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.itemInfo}>
                  <span className={styles.itemApplicant}>{item.applicantName}</span>
                  <span className={styles.itemType}>{item.formTypeName}</span>
                </div>
                {item.previewFields.length > 0 && (
                  <div className={styles.itemPreview}>
                    {item.previewFields.map((field, idx) => (
                      <div key={idx} className={styles.previewField}>
                        <span className={styles.previewLabel}>{field.label}：</span>
                        <span className={styles.previewValue}>{field.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.itemFooter}>
                  {item.status === 'pending' ? (
                    <>
                      <Tag color="orange">等待 {item.currentNodeName || '处理'}</Tag>
                      <TimeoutTag deadlineAt={item.currentNodeDeadlineAt} />
                    </>
                  ) : (
                    <ApprovalStatusTag status={item.status} />
                  )}
                </div>
              </div>
            )}
          />
        )}
      </div>

      {total > 20 && (
        <div className={styles.listFooter}>
          <Button onClick={() => onPageChange(page - 1)} disabled={page === 1}>
            上一页
          </Button>
          <span>{page} / {Math.ceil(total / 20)}</span>
          <Button onClick={() => onPageChange(page + 1)} disabled={page >= Math.ceil(total / 20)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );
};

export default React.memo(ApprovalList);
