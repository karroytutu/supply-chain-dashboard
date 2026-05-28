/**
 * 申诉状态标签组件
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';

interface AppealStatusTagProps {
  record: AssessmentRecord;
}

const AppealStatusTag: React.FC<AppealStatusTagProps> = ({ record }) => {
  if (record.status !== 'appealed') {
    return null;
  }

  const tooltipContent = (
    <div>
      <p>申诉提交时间：{record.appealSubmittedAt ? dayjs(record.appealSubmittedAt).format('YYYY-MM-DD HH:mm') : '-'}</p>
      {record.appealReason && <p>申诉理由：{record.appealReason}</p>}
    </div>
  );

  return (
    <Tooltip title={tooltipContent}>
      <Tag
        color="purple"
        style={{ cursor: 'pointer' }}
        onClick={() => {
          if (record.oaInstanceId) {
            window.open(`/oa/detail/${record.oaInstanceId}`);
          }
        }}
      >
        申诉中
      </Tag>
    </Tooltip>
  );
};

export default AppealStatusTag;
