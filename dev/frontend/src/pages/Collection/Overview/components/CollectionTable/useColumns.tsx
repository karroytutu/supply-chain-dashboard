import React, { useMemo } from 'react';
import { Tooltip, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import StatusCell from '../../../components/StatusCell';
import type { CollectionTask, CollectionTaskStatus } from '@/types/ar-collection';
import type { AssessmentTier } from '@/types/ar-assessment';
import { formatCreatedDate, calcAssessmentTime, TIER_LABELS, TIER_COLORS } from './utils';

interface UseColumnsParams {
  goToDetail: (id: number) => void;
}

function renderAssessmentTiers(tiers: AssessmentTier[] | undefined): React.ReactNode {
  if (!tiers || tiers.length === 0) {
    return '-';
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {tiers.map((tier) => (
        <Tag key={tier} color={TIER_COLORS[tier]}>
          {TIER_LABELS[tier]}
        </Tag>
      ))}
    </div>
  );
}

export function useColumns({ goToDetail }: UseColumnsParams) {
  return useMemo(
    () => [
      {
        title: '任务信息',
        dataIndex: 'taskNo',
        key: 'taskInfo',
        width: 140,
        render: (taskNo: string, record: CollectionTask) => (
          <div className="task-info-cell">
            <a
              className="task-no task-no-link"
              onClick={(e) => {
                e.stopPropagation();
                goToDetail(record.id);
              }}
            >
              {taskNo}
            </a>
            <div className="task-created">
              {formatCreatedDate(record.createdAt)}
            </div>
          </div>
        ),
      },
      {
        title: '客户信息',
        dataIndex: 'consumerName',
        key: 'consumerInfo',
        width: 200,
        render: (name: string, record: CollectionTask) => (
          <div className="customer-cell">
            <div className="customer-name">
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  goToDetail(record.id);
                }}
              >
                {name}
              </a>
            </div>
            {record.currentHandlerName && (
              <Tooltip title="当前处理人">
                <div className="handler-info">
                  <UserOutlined /> {record.currentHandlerName}
                </div>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'statusInfo',
        width: 120,
        render: (status: CollectionTaskStatus, record: CollectionTask) => (
          <StatusCell status={status} escalationLevel={record.escalationLevel} />
        ),
      },
      {
        title: '剩余处理时限',
        key: 'deadline',
        width: 120,
        render: (_: unknown, record: CollectionTask) => {
          const { text, color } = calcAssessmentTime(record.assessmentStartTime);
          return (
            <span style={{ color, fontWeight: 600, fontSize: 13 }}>
              {text}
            </span>
          );
        },
      },
      {
        title: '考核状态',
        key: 'assessment',
        width: 120,
        render: (_: unknown, record: CollectionTask) => renderAssessmentTiers(record.assessmentTiers),
      },
      {
        title: '金额/逾期',
        key: 'amountOverdue',
        width: 160,
        render: (_: unknown, record: CollectionTask) => {
          const amount = record.totalAmount ?? 0;
          const days = record.maxOverdueDays ?? 0;
          return (
            <div className="amount-cell">
              <div className="amount-value">
                <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
                  ¥{Number(amount).toLocaleString()}
                </span>
              </div>
              <div
                className="overdue-days"
                style={{ color: days >= 30 ? '#ff4d4f' : '#8c8c8c', fontSize: 12 }}
              >
                逾期 {days} 天
              </div>
            </div>
          );
        },
      },
    ],
    [goToDetail]
  );
}
