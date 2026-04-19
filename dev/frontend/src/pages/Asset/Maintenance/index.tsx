/**
 * 固定资产维修申请页面
 * 含费用门槛校验：<100元提示报销流程，>=500元需至少2家供应商询价
 */
import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Form, Input, InputNumber, Select, Modal, Space, message, DatePicker, Alert } from 'antd';
import { PlusOutlined, ToolOutlined, DeleteOutlined } from '@ant-design/icons';
import { createMaintenanceApplication, getApplications } from '@/services/api/asset';
import { AssetSelect, ApplicationStatusTag } from '@/components/Asset';
import type { MaintenanceFormData, MaintenanceQuotation, AssetApplication, ErpAsset } from '@/types/asset';

const { TextArea } = Input;

const MaintenancePage: React.FC = () => {
  const [applications, setApplications] = useState<AssetApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ErpAsset | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [quotations, setQuotations] = useState<MaintenanceQuotation[]>([]);

  useEffect(() => {
    fetchApplications();
  }, [page]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const result = await getApplications({ type: 'maintenance', page, pageSize: 20 });
      setApplications(result.data || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      message.error(err.message || '获取维修申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const cost = parseFloat(values.estimatedCost || '0');

      // 费用门槛校验
      if (cost < 100) {
        message.warning('维修费用100元以下建议使用报销流程处理');
        return;
      }

      // >= 500元需至少2家询价
      if (cost >= 500 && quotations.length < 2) {
        message.warning('预估费用500元以上需至少录入2家供应商询价');
        return;
      }

      setSubmitting(true);
      const formData: MaintenanceFormData = {
        erpAssetId: selectedAsset?.id || 0,
        assetNo: selectedAsset?.code || '',
        assetName: selectedAsset?.name || '',
        description: values.description,
        estimatedCost: String(cost),
        urgency: values.urgency,
        attachmentUrls: [],
        quotations: cost >= 500 ? quotations : undefined,
      };
      await createMaintenanceApplication(formData);
      message.success('维修申请提交成功');
      setModalVisible(false);
      form.resetFields();
      setSelectedAsset(null);
      setEstimatedCost(0);
      setQuotations([]);
      fetchApplications();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const addQuotation = () => {
    setQuotations([...quotations, { supplierName: '', quotationPrice: '' }]);
  };

  const removeQuotation = (index: number) => {
    setQuotations(quotations.filter((_, i) => i !== index));
  };

  const updateQuotation = (index: number, field: keyof MaintenanceQuotation, value: any) => {
    const updated = [...quotations];
    updated[index] = { ...updated[index], [field]: value };
    setQuotations(updated);
  };

  const columns = [
    { title: '申请编号', dataIndex: 'applicationNo', key: 'applicationNo' },
    { title: '资产名称', key: 'assetName', render: (_: any, r: AssetApplication) => r.formData?.assetName },
    { title: '预估费用', key: 'estimatedCost', render: (_: any, r: AssetApplication) => `¥${r.formData?.estimatedCost || '-'}` },
    { title: '状态', key: 'status', render: (_: any, r: AssetApplication) => <ApplicationStatusTag status={r.status} /> },
    { title: '申请人', dataIndex: 'applicantName', key: 'applicantName' },
    { title: '申请时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v?.slice(0, 19) },
  ];

  return (
    <div>
      <Card title="固定资产维修申请" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          新建维修申请
        </Button>
      }>
        <Table rowKey="id" columns={columns} dataSource={applications} loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />
      </Card>

      <Modal title="新建维修申请" open={modalVisible} onOk={handleSubmit}
        onCancel={() => setModalVisible(false)} confirmLoading={submitting} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item label="选择资产" required>
            <AssetSelect
              value={selectedAsset?.id}
              onChange={(_, asset) => setSelectedAsset(asset)}
              placeholder="搜索选择需要维修的资产"
            />
            {selectedAsset && (
              <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                {selectedAsset.code} | {selectedAsset.deptName || '无部门'} | {selectedAsset.userName || '无使用人'}
              </div>
            )}
          </Form.Item>
          <Form.Item name="description" label="故障描述" rules={[{ required: true, message: '请输入故障描述' }]}>
            <TextArea rows={3} maxLength={500} placeholder="请描述故障情况" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="estimatedCost" label="预估维修费用(元)" rules={[{ required: true, message: '请输入预估费用' }]}>
              <InputNumber min={0} precision={2} style={{ width: 200 }}
                onChange={v => setEstimatedCost(v || 0)} />
            </Form.Item>
            <Form.Item name="urgency" label="紧急程度" rules={[{ required: true }]} initialValue="normal">
              <Select style={{ width: 160 }} options={[
                { value: 'normal', label: '普通' },
                { value: 'urgent', label: '紧急' },
                { value: 'critical', label: '特急' },
              ]} />
            </Form.Item>
          </Space>

          {estimatedCost > 0 && estimatedCost < 100 && (
            <Alert type="warning" showIcon message="维修费用100元以下建议使用报销流程处理，不允许提交维修申请" style={{ marginBottom: 16 }} />
          )}

          {estimatedCost >= 500 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                供应商询价（预估费用≥500元，至少2家）
              </div>
              {quotations.map((q, index) => (
                <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <Input placeholder="供应商名称" value={q.supplierName}
                    onChange={e => updateQuotation(index, 'supplierName', e.target.value)} style={{ flex: 2 }} />
                  <InputNumber placeholder="报价" min={0} precision={2} value={q.quotationPrice ? parseFloat(q.quotationPrice) : undefined}
                    onChange={v => updateQuotation(index, 'quotationPrice', String(v || 0))} style={{ flex: 1 }} />
                  <Input placeholder="备注" value={q.quotationNote}
                    onChange={e => updateQuotation(index, 'quotationNote', e.target.value)} style={{ flex: 2 }} />
                  <Button icon={<DeleteOutlined />} danger onClick={() => removeQuotation(index)} />
                </div>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={addQuotation} block>
                添加询价记录
              </Button>
              {quotations.length < 2 && (
                <div style={{ color: '#faad14', fontSize: 12, marginTop: 4 }}>
                  至少需要录入2家供应商询价
                </div>
              )}
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default MaintenancePage;
