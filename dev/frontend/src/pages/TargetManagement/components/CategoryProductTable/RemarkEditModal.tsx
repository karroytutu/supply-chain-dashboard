/**
 * 目标说明编辑弹窗
 * 支持品类级别和商品级别的说明编辑
 */
import React, { useState } from 'react';
import { Modal, Input } from 'antd';

interface RemarkEditModalProps {
  visible: boolean;
  customerId: number;
  catId: string;
  prodId: string;
  initialValue: string;
  onSave: (customerId: number, catId: string, prodId: string, value: string) => void;
  onClose: () => void;
}

const RemarkEditModal: React.FC<RemarkEditModalProps> = ({
  visible, customerId, catId, prodId, initialValue, onSave, onClose,
}) => {
  const [value, setValue] = useState(initialValue);

  // 当弹窗重新打开时同步初始值
  React.useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal
      title="目标说明"
      open={visible}
      onOk={() => {
        onSave(customerId, catId, prodId, value);
        onClose();
      }}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      width={400}
    >
      <Input.TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="填写目标说明..."
        maxLength={200}
        showCount
        autoSize={{ minRows: 3, maxRows: 6 }}
      />
    </Modal>
  );
};

export default RemarkEditModal;
