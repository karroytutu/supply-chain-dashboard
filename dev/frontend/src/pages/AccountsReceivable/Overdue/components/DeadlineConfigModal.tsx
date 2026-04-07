/**
 * 时限配置弹窗
 * 配置各节点的时限和预警时间
 */
import React, { useState, useEffect } from 'react';
import { Modal, Button, Table, InputNumber, Switch, message, Spin } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ArDeadlineConfig, OverdueLevel } from '@/types/accounts-receivable';
import { getDeadlineConfigs, updateDeadlineConfig } from '@/services/api/accounts-receivable';

interface DeadlineConfigModalProps {
  visible: boolean;
  onCancel: () => void;
}

const nodeTypeLabels: Record<string, string> = {
  preprocessing: '财务预处理',
  assignment: '营销主管分配',
  collection: '催收执行',
  review: '结果审核',
};

const overdueLevelLabels: Record<OverdueLevel, string> = {
  light: '轻度',
  medium: '中度',
  severe: '重度',
};

const DeadlineConfigModal: React.FC<DeadlineConfigModalProps> = ({
  visible,
  onCancel,
}) => {
  const [configs, setConfigs] = useState<ArDeadlineConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedConfigs, setEditedConfigs] = useState<Record<number, Partial<ArDeadlineConfig>>>({});

  useEffect(() => {
    if (visible) {
      fetchConfigs();
    }
  }, [visible]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const result = await getDeadlineConfigs();
      setConfigs(result);
      setEditedConfigs({});
    } catch (error) {
      message.error('获取时限配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const editedIds = Object.keys(editedConfigs).map(Number);
    if (editedIds.length === 0) {
      message.info('没有修改的配置');
      onCancel();
      return;
    }

    setSaving(true);
    try {
      for (const id of editedIds) {
        const changes = editedConfigs[id];
        // 确保 deadlineHours 不为 undefined，满足 UpdateDeadlineConfigParams 类型要求
        if (changes.deadlineHours === undefined) {
          const originalConfig = configs.find(c => c.id === id);
          if (originalConfig) {
            changes.deadlineHours = originalConfig.deadlineHours;
          }
        }
        await updateDeadlineConfig(id, changes as { deadlineHours: number; warningHours?: number; isActive?: boolean });
      }
      message.success('时限配置保存成功');
      setEditedConfigs({});
      onCancel();
    } catch (error) {
      message.error('保存时限配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (
    id: number,
    field: keyof ArDeadlineConfig,
    value: number | boolean
  ) => {
    setEditedConfigs((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
    setConfigs((prev) =>
      prev.map((config) =>
        config.id === id ? { ...config, [field]: value } : config
      )
    );
  };

  const columns = [
    {
      title: '节点类型',
      dataIndex: 'nodeType',
      key: 'nodeType',
      width: 120,
      render: (type: string) => nodeTypeLabels[type] || type,
    },
    {
      title: '逾期等级',
      dataIndex: 'overdueLevel',
      key: 'overdueLevel',
      width: 100,
      render: (level: OverdueLevel) => overdueLevelLabels[level],
    },
    {
      title: '时限（小时）',
      dataIndex: 'deadlineHours',
      key: 'deadlineHours',
      width: 120,
      render: (value: number, record: ArDeadlineConfig) => (
        <InputNumber
          min={1}
          max={168}
          value={value}
          onChange={(val) => handleFieldChange(record.id, 'deadlineHours', val || 1)}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '预警时间（小时）',
      dataIndex: 'warningHours',
      key: 'warningHours',
      width: 140,
      render: (value: number, record: ArDeadlineConfig) => (
        <InputNumber
          min={1}
          max={record.deadlineHours}
          value={value}
          onChange={(val) => handleFieldChange(record.id, 'warningHours', val || 1)}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '启用',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (value: boolean, record: ArDeadlineConfig) => (
        <Switch
          checked={value}
          onChange={(checked) => handleFieldChange(record.id, 'isActive', checked)}
        />
      ),
    },
  ];

  return (
    <Modal
      title={
        <span>
          <SettingOutlined /> 时限配置
        </span>
      }
      open={visible}
      onOk={handleSave}
      onCancel={onCancel}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      width={800}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <p style={{ marginBottom: 16, color: '#666' }}>
          配置各流程节点在不同逾期等级下的处理时限和预警时间
        </p>
        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          pagination={false}
          size="small"
          bordered
        />
      </Spin>
    </Modal>
  );
};

export default DeadlineConfigModal;
