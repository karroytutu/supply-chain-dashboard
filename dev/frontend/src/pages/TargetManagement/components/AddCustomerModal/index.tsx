/**
 * 添加计划开发客户弹窗
 * 支持多选客户从客户池中添加
 */
import React, { useState, useMemo } from 'react';
import { Modal, Input, Checkbox, Button, Tag } from 'antd';

interface AvailableCustomer {
  customerId: string;
  customerName: string;
  industry: string;
  status: string;
}

interface AddCustomerModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (customers: Array<{ customerId: string; customerName: string }>) => void;
  availableCustomers: AvailableCustomer[];
}

const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ visible, onClose, onSuccess, availableCustomers }) => {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!keyword) return availableCustomers;
    return availableCustomers.filter((c) => c.customerName.includes(keyword));
  }, [availableCustomers, keyword]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleOk = () => {
    const result = availableCustomers
      .filter((c) => selected.has(c.customerId))
      .map((c) => ({ customerId: c.customerId, customerName: c.customerName }));
    onSuccess(result);
    setSelected(new Set());
    setKeyword('');
  };

  const handleClose = () => {
    setSelected(new Set());
    setKeyword('');
    onClose();
  };

  return (
    <Modal
      title="添加计划开发客户"
      open={visible}
      onCancel={handleClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="ok" type="primary" disabled={selected.size === 0} onClick={handleOk}>
          确认添加 ({selected.size})
        </Button>,
      ]}
    >
      <Input.Search
        placeholder="搜索客户名称/编号..."
        allowClear
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {filtered.map((customer) => (
          <div
            key={customer.customerId}
            onClick={() => toggleSelect(customer.customerId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              cursor: 'pointer', borderRadius: 4,
              background: selected.has(customer.customerId) ? '#e6f7ff' : 'transparent',
              borderBottom: '1px solid #f5f5f5',
            }}
          >
            <Checkbox checked={selected.has(customer.customerId)} />
            <span style={{ flex: 1 }}>{customer.customerName}</span>
            <Tag>{customer.industry}</Tag>
            <Tag color={customer.status === '已合作' ? 'green' : 'default'}>{customer.status}</Tag>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
        已选择: {selected.size} 个客户
      </div>
    </Modal>
  );
};

export default AddCustomerModal;
