/**
 * 分配弹窗
 * 分配逾期任务给催收人员
 */
import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Form, message, Tag, Spin } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import type { OverdueTaskItem, AvailableCollector } from '@/types/accounts-receivable';
import { getAvailableCollectors, assignOverdueTask } from '@/services/api/accounts-receivable';

interface AssignmentModalProps {
  visible: boolean;
  task: OverdueTaskItem | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const AssignmentModal: React.FC<AssignmentModalProps> = ({
  visible,
  task,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [collectors, setCollectors] = useState<AvailableCollector[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchCollectors();
    }
  }, [visible]);

  const fetchCollectors = async () => {
    setFetching(true);
    try {
      const result = await getAvailableCollectors();
      setCollectors(result);
    } catch (error) {
      message.error('获取催收人员列表失败');
    } finally {
      setFetching(false);
    }
  };

  const handleOk = async () => {
    if (!task) return;

    const values = await form.validateFields();
    setLoading(true);

    try {
      await assignOverdueTask({
        customerTaskId: task.id,
        collectorId: values.collectorId,
      });
      message.success('任务分配成功');
      form.resetFields();
      onSuccess();
    } catch (error) {
      message.error('任务分配失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  const selectedCollector = collectors.find(
    (c) => c.id === form.getFieldValue('collectorId')
  );

  return (
    <Modal
      title={
        <span>
          <UserAddOutlined /> 分配任务
        </span>
      }
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确认分配"
      cancelText="取消"
      destroyOnClose
    >
      <Spin spinning={fetching}>
        <Form form={form} layout="vertical">
          <Form.Item label="任务编号">
            <span className="ant-form-text">{task?.taskNo}</span>
          </Form.Item>
          <Form.Item label="客户名称">
            <span className="ant-form-text">{task?.consumerName}</span>
          </Form.Item>
          <Form.Item label="总金额">
            <span className="ant-form-text">
              {task?.totalAmount ? `¥${task.totalAmount.toLocaleString()}` : '-'}
            </span>
          </Form.Item>
          <Form.Item
            name="collectorId"
            label="选择催收人"
            rules={[{ required: true, message: '请选择催收人' }]}
          >
            <Select
              placeholder="请选择催收人"
              loading={fetching}
              showSearch
              optionFilterProp="children"
            >
              {collectors.map((collector) => (
                <Select.Option key={collector.id} value={collector.id}>
                  {collector.name} ({collector.taskCount}个任务)
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {selectedCollector && (
            <Form.Item>
              <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 4 }}>
                <Tag color="green">{selectedCollector.name}</Tag>
                <span>当前任务数: </span>
                <Tag color="blue">{selectedCollector.taskCount}</Tag>
              </div>
            </Form.Item>
          )}
        </Form>
      </Spin>
    </Modal>
  );
};

export default AssignmentModal;
