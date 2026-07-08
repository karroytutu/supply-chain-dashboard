/**
 * 流程中心 - 筛选面板 + 已选标签
 * 紧凑垂直布局，适配 300px 列表面板宽度
 * 条件选中即生效，无需确认按钮
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Select, DatePicker, Input, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { FormTypeDefinition, ViewMode } from '@/types/oa';
import { useIsMobile } from '@/hooks/useMobileDetect';
import { MobileSelect, MobileDateRangePicker } from '@/components/Mobile';
import styles from '../index.less';

const { RangePicker } = DatePicker;

// 审批状态映射（与 DataFilterBar 保持一致）
const statusMap: Record<string, { text: string; color: string }> = {
  pending: { text: '处理中', color: 'processing' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已拒绝', color: 'error' },
  withdrawn: { text: '已撤回', color: 'default' },
  cancelled: { text: '已取消', color: 'warning' },
};

const statusOptions = Object.entries(statusMap).map(([value, { text }]) => ({
  value,
  label: text,
}));

// "待处理"和"抄送给我"视图下状态筛选无意义
const viewModesWithStatusFilter: ViewMode[] = ['processed', 'my'];

interface FilterPanelProps {
  viewMode: ViewMode;
  formTypeCode: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  applicantName: string | null;
  formTypes: FormTypeDefinition[];
  setFormTypeCode: (val: string | undefined) => void;
  setStatus: (val: string | undefined) => void;
  setDateRange: (dates: [Dayjs, Dayjs] | null) => void;
  setApplicantName: (val: string | undefined) => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  viewMode, formTypeCode, status, startDate, endDate, applicantName,
  formTypes, setFormTypeCode, setStatus, setDateRange, setApplicantName,
}) => {
  const isMobile = useIsMobile();
  // 申请人本地输入状态（onBlur/onPressEnter 时才提交到 URL）
  const [localApplicant, setLocalApplicant] = useState(applicantName ?? '');

  // 外部清空（如 clearFilters）时同步本地状态
  useEffect(() => {
    setLocalApplicant(applicantName ?? '');
  }, [applicantName]);

  const commitApplicant = useCallback(() => {
    const trimmed = localApplicant.trim();
    if (trimmed !== (applicantName ?? '')) {
      setApplicantName(trimmed || undefined);
    }
  }, [localApplicant, applicantName, setApplicantName]);

  // 日期范围转为 Dayjs 对象供 RangePicker 使用
  const dateRangeValue: [Dayjs, Dayjs] | null =
    startDate && endDate ? [dayjs(startDate), dayjs(endDate)] : null;

  const showStatusFilter = viewModesWithStatusFilter.includes(viewMode);

  return (
    <div
      className={styles.filterPanel}
      role="region"
      aria-label="筛选条件"
    >
      <div className={styles.filterRow}>
        {isMobile ? (
          <MobileSelect
            value={formTypeCode ?? undefined}
            onChange={(v) => setFormTypeCode(v as string | undefined)}
            options={formTypes.map((ft) => ({ value: ft.code, label: ft.name }))}
            placeholder="表单类型"
            allowClear
            title="表单类型"
            style={{ width: '100%' }}
          />
        ) : (
          <Select
            placeholder="表单类型"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            size="small"
            value={formTypeCode ?? undefined}
            onChange={setFormTypeCode}
            aria-label="表单类型筛选"
            options={formTypes.map((ft) => ({ value: ft.code, label: ft.name }))}
          />
        )}

        {showStatusFilter && (
          isMobile ? (
            <MobileSelect
              value={status ?? undefined}
              onChange={(v) => setStatus(v as string | undefined)}
              options={statusOptions}
              placeholder="审批状态"
              allowClear
              title="审批状态"
              style={{ width: '100%' }}
            />
          ) : (
            <Select
              placeholder="审批状态"
              allowClear
              style={{ width: '100%' }}
              size="small"
              value={status ?? undefined}
              onChange={setStatus}
              aria-label="审批状态筛选"
              options={statusOptions}
            />
          )
        )}

        {isMobile ? (
          <MobileDateRangePicker
            value={startDate && endDate ? [startDate, endDate] : null}
            onChange={(val) => {
              if (val && val[0] && val[1]) {
                setDateRange([dayjs(val[0]), dayjs(val[1])]);
              } else {
                setDateRange(null);
              }
            }}
          />
        ) : (
          <RangePicker
            style={{ width: '100%' }}
            size="small"
            value={dateRangeValue}
            onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
            placeholder={['开始日期', '结束日期']}
            aria-label="日期范围筛选"
          />
        )}

        <Input
          placeholder="申请人姓名"
          size={isMobile ? undefined : 'small'}
          allowClear
          value={localApplicant}
          onChange={(e) => setLocalApplicant(e.target.value)}
          onBlur={commitApplicant}
          onPressEnter={commitApplicant}
          aria-label="申请人姓名筛选"
        />
      </div>
    </div>
  );
};

// ---- ActiveFilterTags ----

interface ActiveFilterTagsProps {
  formTypeCode: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  applicantName: string | null;
  formTypes: FormTypeDefinition[];
  setFormTypeCode: (val: string | undefined) => void;
  setStatus: (val: string | undefined) => void;
  setDateRange: (dates: null) => void;
  setApplicantName: (val: string | undefined) => void;
}

export const ActiveFilterTags: React.FC<ActiveFilterTagsProps> = ({
  formTypeCode, status, startDate, endDate, applicantName,
  formTypes, setFormTypeCode, setStatus, setDateRange, setApplicantName,
}) => {
  const hasAny = formTypeCode || status || (startDate && endDate) || applicantName;
  if (!hasAny) return null;

  return (
    <div className={styles.filterTags} role="group" aria-label="已选筛选条件">
      {formTypeCode && (
        <Tag closable onClose={() => setFormTypeCode(undefined)}>
          {formTypes.find((f) => f.code === formTypeCode)?.name ?? formTypeCode}
        </Tag>
      )}
      {status && (
        <Tag closable onClose={() => setStatus(undefined)}>
          {statusMap[status]?.text ?? status}
        </Tag>
      )}
      {startDate && endDate && (
        <Tag closable onClose={() => setDateRange(null)}>
          {startDate} ~ {endDate}
        </Tag>
      )}
      {applicantName && (
        <Tag closable onClose={() => setApplicantName(undefined)}>
          {applicantName}
        </Tag>
      )}
    </div>
  );
};

export default React.memo(FilterPanel);
