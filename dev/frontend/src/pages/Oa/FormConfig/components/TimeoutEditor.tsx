/**
 * 时限配置编辑器组件
 * 嵌入节点卡片内，支持编辑时限天数、催办策略和考核分级
 */
import React from 'react';
import { Checkbox, InputNumber, Table, Button, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface AssessmentTier {
  name: string;
  minOverdueDays: number;
  maxOverdueDays: number | null;
  penaltyAmount: number;
}

interface ReminderConfig {
  firstReminderDelayMinutes?: number;
  intervalMinutes?: number;
  maxReminders?: number;
  ccSupervisorAfterCount?: number;
}

interface TimeoutConfig {
  durationMinutes: number;
  gracePeriodMinutes?: number;
  reminder?: ReminderConfig;
  assessment?: {
    tiers: AssessmentTier[];
    exemptNodeNames?: string[];
  };
}

interface TimeoutEditorProps {
  timeout: TimeoutConfig | null | undefined;
  onChange: (value: TimeoutConfig | null) => void;
}

const TimeoutEditor: React.FC<TimeoutEditorProps> = ({ timeout, onChange }) => {
  const enabled = !!timeout;

  const updateConfig = (updates: Partial<TimeoutConfig>) => {
    onChange({ ...timeout!, ...updates });
  };

  const updateReminder = (updates: Partial<ReminderConfig>) => {
    if (!timeout) return;
    onChange({
      ...timeout,
      reminder: { ...timeout.reminder, ...updates },
    });
  };

  const updateTier = (index: number, updates: Partial<AssessmentTier>) => {
    if (!timeout?.assessment) return;
    const newTiers = [...timeout.assessment.tiers];
    newTiers[index] = { ...newTiers[index], ...updates };
    onChange({
      ...timeout,
      assessment: { ...timeout.assessment, tiers: newTiers },
    });
  };

  const addTier = () => {
    if (!timeout) return;
    const tiers = timeout.assessment?.tiers || [];
    const lastTier = tiers[tiers.length - 1];
    const newMinDays = lastTier ? (lastTier.maxOverdueDays || lastTier.minOverdueDays + 2) : 1;
    onChange({
      ...timeout,
      assessment: {
        ...timeout.assessment,
        tiers: [
          ...tiers,
          { name: `新增分级`, minOverdueDays: newMinDays, maxOverdueDays: null, penaltyAmount: 0 },
        ],
        exemptNodeNames: timeout.assessment?.exemptNodeNames,
      },
    });
  };

  const removeTier = (index: number) => {
    if (!timeout?.assessment) return;
    const newTiers = timeout.assessment.tiers.filter((_, i) => i !== index);
    onChange({
      ...timeout,
      assessment: { ...timeout.assessment, tiers: newTiers },
    });
  };

  const tierColumns = [
    {
      title: '分级名称',
      dataIndex: 'name',
      render: (val: string, _: unknown, index: number) => (
        <input
          value={val}
          onChange={(e) => updateTier(index, { name: e.target.value })}
          style={{ width: 120, border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 6px' }}
        />
      ),
    },
    {
      title: '超时天数下限',
      dataIndex: 'minOverdueDays',
      render: (val: number, _: unknown, index: number) => (
        <InputNumber
          size="small"
          value={val}
          min={1}
          onChange={(v) => updateTier(index, { minOverdueDays: v || 1 })}
        />
      ),
    },
    {
      title: '超时天数上限',
      dataIndex: 'maxOverdueDays',
      render: (val: number | null, _: unknown, index: number) => (
        <InputNumber
          size="small"
          value={val}
          min={1}
          placeholder="无上限"
          onChange={(v) => updateTier(index, { maxOverdueDays: v })}
        />
      ),
    },
    {
      title: '考核金额(元/天)',
      dataIndex: 'penaltyAmount',
      render: (val: number, _: unknown, index: number) => (
        <InputNumber
          size="small"
          value={val}
          min={0}
          onChange={(v) => updateTier(index, { penaltyAmount: v || 0 })}
        />
      ),
    },
    {
      title: '操作',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeTier(index)}
        />
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Checkbox
        checked={enabled}
        onChange={(e) => {
          if (e.target.checked) {
            onChange({
              durationMinutes: 3 * 24 * 60,
              gracePeriodMinutes: 0,
            });
          } else {
            onChange(null);
          }
        }}
      >
        启用时限
      </Checkbox>

      {enabled && timeout && (
        <>
          <Space>
            <Text>时限天数：</Text>
            <InputNumber
              size="small"
              value={Math.round(timeout.durationMinutes / (24 * 60))}
              min={1}
              onChange={(days) =>
                updateConfig({ durationMinutes: (days || 1) * 24 * 60 })
              }
            />
            <Text type="secondary">天</Text>
          </Space>

          <Space>
            <Text>免考核宽限期：</Text>
            <InputNumber
              size="small"
              value={Math.round((timeout.gracePeriodMinutes || 0) / (24 * 60))}
              min={0}
              onChange={(days) =>
                updateConfig({ gracePeriodMinutes: (days || 0) * 24 * 60 })
              }
            />
            <Text type="secondary">天</Text>
          </Space>

          <Divider style={{ margin: '8px 0' }} />

          {/* 催办策略 */}
          <Checkbox
            checked={!!timeout.reminder}
            onChange={(e) => {
              updateConfig({
                reminder: e.target.checked
                  ? { firstReminderDelayMinutes: 0, intervalMinutes: 480, maxReminders: 10, ccSupervisorAfterCount: 2 }
                  : undefined,
              });
            }}
          >
            启用催办
          </Checkbox>

          {timeout.reminder && (
            <Space direction="vertical" style={{ marginLeft: 24, width: '100%' }}>
              <Space>
                <Text>催办间隔：</Text>
                <InputNumber
                  size="small"
                  value={Math.round(timeout.reminder.intervalMinutes! / 60)}
                  min={1}
                  onChange={(hours) =>
                    updateReminder({ intervalMinutes: (hours || 1) * 60 })
                  }
                />
                <Text type="secondary">小时</Text>
              </Space>
              <Space>
                <Text>最大催办次数：</Text>
                <InputNumber
                  size="small"
                  value={timeout.reminder.maxReminders}
                  min={1}
                  onChange={(v) => updateReminder({ maxReminders: v || 1 })}
                />
                <Text type="secondary">次</Text>
              </Space>
              <Space>
                <Text>抄送上级：催办</Text>
                <InputNumber
                  size="small"
                  value={timeout.reminder.ccSupervisorAfterCount}
                  min={0}
                  onChange={(v) => updateReminder({ ccSupervisorAfterCount: v || 0 })}
                />
                <Text type="secondary">次后抄送</Text>
              </Space>
            </Space>
          )}

          <Divider style={{ margin: '8px 0' }} />

          {/* 考核分级 */}
          <Checkbox
            checked={!!timeout.assessment}
            onChange={(e) => {
              updateConfig({
                assessment: e.target.checked
                  ? { tiers: [], exemptNodeNames: [] }
                  : undefined,
              });
            }}
          >
            启用考核
          </Checkbox>

          {timeout.assessment && (
            <div style={{ marginLeft: 24 }}>
              <Table
                dataSource={timeout.assessment.tiers}
                columns={tierColumns}
                rowKey={(_, i) => String(i)}
                pagination={false}
                size="small"
                bordered
              />
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={addTier}
                style={{ marginTop: 8, width: '100%' }}
              >
                添加分级
              </Button>
            </div>
          )}
        </>
      )}
    </Space>
  );
};

export default TimeoutEditor;
