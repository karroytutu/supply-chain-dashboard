/**
 * 添加计划开发客户弹窗
 * 支持多选客户从客户池中添加
 */
import React, { useState, useMemo } from 'react';
import { Modal, Input, Checkbox, Button, Tag } from 'antd';
import styles from './index.less';

interface AvailableCustomer {
  customerId: number;
  customerName: string;
  industry: string;
  status: string;
}

interface AddCustomerModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (customers: Array<{ customerId: number; customerName: string }>) => void;
  availableCustomers: AvailableCustomer[];
}

const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ visible, onClose, onSuccess, availableCustomers }) => {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    if (!keyword) return availableCustomers;
    return availableCustomers.filter((c) => c.customerName.includes(keyword));
  }, [availableCustomers, keyword]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSelect(id);
    }
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
      <div className={styles.listContainer}>
        {filtered.map((customer) => {
          const isSelected = selected.has(customer.customerId);
          return (
            <div
              key={customer.customerId}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => toggleSelect(customer.customerId)}
              onKeyDown={(e) => handleKeyDown(e, customer.customerId)}
              className={`${styles.listItem} ${isSelected ? styles.listItemSelected : ''}`}
            >
              <Checkbox checked={isSelected} />
              <span className={styles.itemName}>{customer.customerName}</span>
              <Tag>{customer.industry}</Tag>
              <Tag color={customer.status === '已合作' ? 'green' : 'default'}>{customer.status}</Tag>
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        已选择: {selected.size} 个客户
      </div>
    </Modal>
  );
};

export default AddCustomerModal;
