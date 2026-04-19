/**
 * 固定资产采购申请页面
 */
import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Form, Input, InputNumber, Select, Upload, Modal, Space, message, DatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { createPurchaseApplication, getApplications, getErpAssetCategories, getErpStaff, getErpPaymentAccounts } from '@/services/api/asset';
import { ApplicationStatusTag } from '@/components/Asset';
import type { PurchaseLine, PurchaseFormData, AssetApplication, ErpAssetCategory, ErpStaff, ErpPaymentAccount } from '@/types/asset';

const { TextArea } = Input;

const PurchasePage: React.FC = () => {
  const [applications, setApplications] = useState<AssetApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [lines, setLines] = useState<PurchaseLine[]>([
    { assetName: '', specification: '', quantity: 1, estimatedBudget: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [page]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const result = await getApplications({ type: 'purchase', page, pageSize: 20 });
      setApplications(result.data || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      message.error(err.message || '获取采购申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lines.length === 0 || !lines[0].assetName) {
        message.error('请至少添加一条采购明细');
        return;
      }
      setSubmitting(true);
      const formData: PurchaseFormData = {
        purchaseReason: values.purchaseReason,
        urgency: values.urgency,
        attachmentUrls: [],
        lines,
      };
      await createPurchaseApplication(formData);
      message.success('采购申请提交成功');
      setModalVisible(false);
      form.resetFields();
      setLines([{ assetName: '', specification: '', quantity: 1, estimatedBudget: '' }]);
      fetchApplications();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const addLine = () => {
    setLines([...lines, { assetName: '', specification: '', quantity: 1, estimatedBudget: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof PurchaseLine, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const columns = [
    { title: '申请编号', dataIndex: 'applicationNo', key: 'applicationNo' },
    { title: '采购明细', key: 'detail', render: (_: any, r: AssetApplication) => {
      const fd = r.formData;
      return fd?.lines?.map((l: PurchaseLine, i: number) => (
        <div key={i}>{l.assetName} x{l.quantity}</div>
      ));
    }},
    { title: '状态', key: 'status', render: (_: any, r: AssetApplication) => <ApplicationStatusTag status={r.status} /> },
    { title: '申请人', dataIndex: 'applicantName', key: 'applicantName' },
    { title: '申请时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v?.slice(0, 19) },
  ];

  return (
    <div>
      <Card title="固定资产采购申请" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          新建采购申请
        </Button>
      }>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={applications}
          loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
        />
      </Card>

      <Modal
        title="新建采购申请"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="purchaseReason" label="采购原因" rules={[{ required: true, message: '请输入采购原因' }]}>
            <TextArea rows={3} placeholder="请输入采购原因" maxLength={500} />
          </Form.Item>
          <Form.Item name="urgency" label="紧急程度" rules={[{ required: true, message: '请选择紧急程度' }]} initialValue="normal">
            <Select options={[
              { value: 'normal', label: '普通' },
              { value: 'urgent', label: '紧急' },
              { value: 'critical', label: '特急' },
            ]} />
          </Form.Item>

          <div style={{ marginBottom: 8, fontWeight: 600 }}>采购明细</div>
          {lines.map((line, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <Input placeholder="资产名称" value={line.assetName} onChange={e => updateLine(index, 'assetName', e.target.value)} />
              </div>
              <div style={{ flex: 2 }}>
                <Input placeholder="规格型号" value={line.specification} onChange={e => updateLine(index, 'specification', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <InputNumber placeholder="数量" min={1} value={line.quantity} onChange={v => updateLine(index, 'quantity', v || 1)} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <InputNumber placeholder="预估预算" min={0} value={line.estimatedBudget ? parseFloat(line.estimatedBudget) : undefined} onChange={v => updateLine(index, 'estimatedBudget', String(v || 0))} style={{ width: '100%' }} />
              </div>
              <Button icon={<DeleteOutlined />} danger disabled={lines.length <= 1} onClick={() => removeLine(index)} />
            </div>
          ))}
          <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} block>
            添加明细行
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default PurchasePage;
