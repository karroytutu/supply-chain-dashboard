/**
 * 固定资产领用调拨申请页面
 */
import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Form, Input, Select, Modal, Space, message, DatePicker } from 'antd';
import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { createTransferApplication, getApplications, searchErpAssets, getErpStaff, getErpDepartments } from '@/services/api/asset';
import { AssetSelect, ApplicationStatusTag } from '@/components/Asset';
import type { TransferLine, TransferFormData, TransferType, AssetApplication, ErpAsset, ErpStaff, ErpDepartment } from '@/types/asset';
import styles from './index.less';

const { TextArea } = Input;

const TransferPage: React.FC = () => {
  const [applications, setApplications] = useState<AssetApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [lines, setLines] = useState<TransferLine[]>([
    { erpAssetId: 0, assetNo: '', assetName: '', toDeptId: 0, toUserId: 0, toDepositAddress: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [staff, setStaff] = useState<ErpStaff[]>([]);
  const [departments, setDepartments] = useState<ErpDepartment[]>([]);

  useEffect(() => {
    fetchApplications();
    loadReferenceData();
  }, [page]);

  const loadReferenceData = async () => {
    try {
      const [staffData, deptData] = await Promise.all([getErpStaff(), getErpDepartments()]);
      setStaff(staffData || []);
      setDepartments(deptData || []);
    } catch (err) {
      console.warn('加载参考数据（员工/部门）失败:', err);
    }
  };

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const result = await getApplications({ type: 'transfer', page, pageSize: 20 });
      setApplications(result.data || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      message.error(err.message || '获取调拨申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const formData: TransferFormData = {
        transferType: values.transferType,
        transferDate: values.transferDate?.format('YYYY-MM-DD'),
        reason: values.reason,
        lines,
      };
      await createTransferApplication(formData);
      message.success('调拨申请提交成功');
      setModalVisible(false);
      form.resetFields();
      setLines([{ erpAssetId: 0, assetNo: '', assetName: '', toDeptId: 0, toUserId: 0, toDepositAddress: '' }]);
      fetchApplications();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssetSelect = (index: number, assetId: number, asset: ErpAsset | null) => {
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      erpAssetId: assetId,
      assetNo: asset?.code || '',
      assetName: asset?.name || '',
      currentDeptName: asset?.deptName,
      currentUserName: asset?.userName,
      currentLocation: asset?.depositAddress,
    };
    setLines(updated);
  };

  const updateLine = (index: number, field: keyof TransferLine, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const addLine = () => {
    setLines([...lines, { erpAssetId: 0, assetNo: '', assetName: '', toDeptId: 0, toUserId: 0, toDepositAddress: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const columns = [
    { title: '申请编号', dataIndex: 'applicationNo', key: 'applicationNo' },
    { title: '类型', key: 'transferType', render: (_: any, r: AssetApplication) =>
      r.formData?.transferType === 'requisition' ? '领用' : '调拨' },
    { title: '状态', key: 'status', render: (_: any, r: AssetApplication) => <ApplicationStatusTag status={r.status} /> },
    { title: '申请人', dataIndex: 'applicantName', key: 'applicantName' },
    { title: '申请时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v?.slice(0, 19) },
  ];

  return (
    <div>
      <Card title="固定资产领用调拨" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          新建领用/调拨
        </Button>
      }>
        <Table rowKey="id" columns={columns} dataSource={applications} loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />
      </Card>

      <Modal title="新建领用/调拨申请" open={modalVisible} onOk={handleSubmit}
        onCancel={() => setModalVisible(false)} confirmLoading={submitting} width={800}>
        <Form form={form} layout="vertical">
          <Space className={styles.fullWidth} size="large">
            <Form.Item name="transferType" label="申请类型" rules={[{ required: true }]} initialValue="requisition">
              <Select className={styles.width160} options={[
                { value: 'requisition', label: '领用' },
                { value: 'transfer', label: '调拨' },
              ]} />
            </Form.Item>
            <Form.Item name="transferDate" label="领用/调拨日期" rules={[{ required: true }]}>
              <DatePicker className={styles.width200} />
            </Form.Item>
          </Space>
          <Form.Item name="reason" label="原因" rules={[{ required: true, message: '请输入原因' }]}>
            <TextArea rows={2} maxLength={500} />
          </Form.Item>

          <div className={styles.sectionHeader}>资产明细</div>
          {lines.map((line, index) => (
            <div key={index} className={styles.lineContainer}>
              <Space direction="vertical" className={styles.fullWidth}>
                <div className={styles.lineRowCenter}>
                  <AssetSelect
                    value={line.erpAssetId || undefined}
                    onChange={(id, asset) => handleAssetSelect(index, id, asset)}
                    placeholder="搜索选择资产"
                  />
                  <Button icon={<PlusOutlined />} onClick={addLine} />
                  <Button icon={<>✕</>} danger disabled={lines.length <= 1} onClick={() => removeLine(index)} />
                </div>
                {line.assetName && (
                  <div className={styles.assetInfo}>
                    当前：{line.currentDeptName || '无'} / {line.currentUserName || '无'} / {line.currentLocation || '无'}
                  </div>
                )}
                <Space>
                  <Select placeholder="新使用部门" className={styles.width200} value={line.toDeptId || undefined}
                    onChange={v => updateLine(index, 'toDeptId', v)}
                    options={departments.map(d => ({ value: d.deptId, label: d.deptName }))} />
                  <Select placeholder="新使用人" className={styles.width200} value={line.toUserId || undefined}
                    onChange={v => updateLine(index, 'toUserId', v)}
                    options={staff.map(s => ({ value: s.id, label: `${s.name} (${s.deptName})` }))} />
                  <Input placeholder="新存放地点" className={styles.width200} value={line.toDepositAddress}
                    onChange={e => updateLine(index, 'toDepositAddress', e.target.value)} />
                </Space>
              </Space>
            </div>
          ))}
        </Form>
      </Modal>
    </div>
  );
};

export default TransferPage;
