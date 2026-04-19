/**
 * 固定资产清理申请页面
 * 支持出售/盘亏两种方式，有收入时显示处置收入字段
 */
import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Form, Input, InputNumber, Select, Modal, Switch, Space, message, DatePicker, Descriptions } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { createDisposalApplication, getApplications } from '@/services/api/asset';
import { AssetSelect, ApplicationStatusTag } from '@/components/Asset';
import type { DisposalFormData, DisposalType, AssetApplication, ErpAsset } from '@/types/asset';

const { TextArea } = Input;

const DisposalPage: React.FC = () => {
  const [applications, setApplications] = useState<AssetApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ErpAsset | null>(null);
  const [hasIncome, setHasIncome] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [page]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const result = await getApplications({ type: 'disposal', page, pageSize: 20 });
      setApplications(result.data || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      message.error(err.message || '获取清理申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedAsset) {
        message.error('请选择要清理的资产');
        return;
      }
      setSubmitting(true);
      const formData: DisposalFormData = {
        erpAssetId: selectedAsset.id,
        assetNo: selectedAsset.code,
        assetName: selectedAsset.name,
        originalValue: selectedAsset.originalValue,
        accumulatedDepreciation: selectedAsset.accumulatedDepreciation,
        netValue: selectedAsset.netValue,
        disposalType: values.disposalType,
        disposalReason: values.disposalReason,
        hasIncome,
        disposalValue: hasIncome ? values.disposalValue : undefined,
        disposalDate: values.disposalDate?.format('YYYY-MM-DD'),
        attachmentUrls: [],
      };
      await createDisposalApplication(formData);
      message.success('清理申请提交成功');
      setModalVisible(false);
      form.resetFields();
      setSelectedAsset(null);
      setHasIncome(false);
      fetchApplications();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: '申请编号', dataIndex: 'applicationNo', key: 'applicationNo' },
    { title: '资产名称', key: 'assetName', render: (_: any, r: AssetApplication) => r.formData?.assetName },
    { title: '清理方式', key: 'disposalType', render: (_: any, r: AssetApplication) =>
      r.formData?.disposalType === 'sale' ? '出售' : '盘亏' },
    { title: '状态', key: 'status', render: (_: any, r: AssetApplication) => <ApplicationStatusTag status={r.status} /> },
    { title: '申请人', dataIndex: 'applicantName', key: 'applicantName' },
    { title: '申请时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v?.slice(0, 19) },
  ];

  return (
    <div>
      <Card title="固定资产清理申请" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          新建清理申请
        </Button>
      }>
        <Table rowKey="id" columns={columns} dataSource={applications} loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />
      </Card>

      <Modal title="新建清理申请" open={modalVisible} onOk={handleSubmit}
        onCancel={() => setModalVisible(false)} confirmLoading={submitting} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item label="选择资产" required>
            <AssetSelect
              value={selectedAsset?.id}
              onChange={(_, asset) => setSelectedAsset(asset)}
              placeholder="搜索选择要清理的资产"
            />
          </Form.Item>

          {selectedAsset && (
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="资产编号">{selectedAsset.code}</Descriptions.Item>
              <Descriptions.Item label="资产名称">{selectedAsset.name}</Descriptions.Item>
              <Descriptions.Item label="原值">¥{selectedAsset.originalValue || '-'}</Descriptions.Item>
              <Descriptions.Item label="净值">¥{selectedAsset.netValue || '-'}</Descriptions.Item>
              <Descriptions.Item label="累计折旧">¥{selectedAsset.accumulatedDepreciation || '-'}</Descriptions.Item>
              <Descriptions.Item label="使用状态">{selectedAsset.usageStatusStr || '-'}</Descriptions.Item>
            </Descriptions>
          )}

          <Form.Item name="disposalType" label="清理方式" rules={[{ required: true, message: '请选择清理方式' }]}>
            <Select options={[
              { value: 'sale', label: '出售' },
              { value: 'inventory_loss', label: '盘亏' },
            ]} placeholder="请选择清理方式" />
          </Form.Item>
          <Form.Item name="disposalReason" label="清理原因" rules={[{ required: true, message: '请输入清理原因' }]}>
            <TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Space size="large" align="end">
            <Form.Item label="是否产生收入">
              <Switch checked={hasIncome} onChange={setHasIncome} checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
            {hasIncome && (
              <Form.Item name="disposalValue" label="处置收入(元)" rules={[{ required: hasIncome, message: '请输入处置收入' }]}>
                <InputNumber min={0} precision={2} style={{ width: 200 }} />
              </Form.Item>
            )}
            <Form.Item name="disposalDate" label="清理日期" rules={[{ required: true, message: '请选择清理日期' }]}>
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default DisposalPage;
