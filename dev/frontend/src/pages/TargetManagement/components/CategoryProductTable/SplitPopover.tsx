/**
 * 品类目标拆分 Popover
 */
import React, { useState } from 'react';
import { Button, InputNumber, Segmented } from 'antd';
import type { SplitMethod } from '@/types/target-management';
import styles from './index.less';

interface SplitPopoverProps {
  customerId: number;
  catId: string;
  currentTotal: number;
  onSplit: (customerId: number, catId: string, method: SplitMethod, targetAmount: number) => void;
  onClose: () => void;
}

const SplitPopover: React.FC<SplitPopoverProps> = ({ customerId, catId, currentTotal, onSplit, onClose }) => {
  const [amount, setAmount] = useState<number>(currentTotal);
  const [method, setMethod] = useState<SplitMethod>('by_proportion');

  return (
    <div className={styles.splitPopover}>
      <div className={styles.splitLabel}>拆分目标金额到各商品</div>
      <InputNumber prefix="¥" defaultValue={currentTotal} onChange={(v) => setAmount(v || 0)}
        className={styles.splitInput} precision={0} step={10000} placeholder="品类目标总额" autoFocus />
      <Segmented value={method} onChange={(v) => setMethod(v as SplitMethod)}
        options={[{ label: '按比例', value: 'by_proportion' }, { label: '平均分', value: 'even' }]}
        size="small" block />
      <Button type="primary" size="small" block className={styles.splitConfirmBtn}
        onClick={() => { onSplit(customerId, catId, method, amount); onClose(); }}>
        确认拆分
      </Button>
      <Button size="small" block onClick={onClose}>
        取消
      </Button>
    </div>
  );
};

export default SplitPopover;
