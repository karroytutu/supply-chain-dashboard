/**
 * 银行账户字段统一控件（bank_account_selector）
 * mode=readonly: 展示户名 + 银行 + 掩码账号 + 开户行
 * mode=editable: 委托 BankAccountSelector 组件
 */
import React from 'react';
import { Typography } from 'antd';
import BankAccountSelector, { type BankAccountValue } from '../BankAccountSelector';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const BankAccountFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange }) => {
  if (mode === 'editable') {
    return (
      <BankAccountSelector
        value={value as BankAccountValue | null | undefined}
        onChange={onChange as ((v: BankAccountValue | null) => void) | undefined}
      />
    );
  }

  // readonly
  const account = value as { accountName: string; accountNumber: string; bankName: string; branchName: string } | null;
  if (!account || !account.accountName) return <Text type="secondary">-</Text>;
  const maskNum = account.accountNumber && account.accountNumber.length > 10
    ? account.accountNumber.slice(0, 6) + '****' + account.accountNumber.slice(-4)
    : account.accountNumber;
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{account.accountName}</div>
      <div style={{ fontSize: 13, color: '#666' }}>{account.bankName} {maskNum}</div>
      {account.branchName && <div style={{ fontSize: 12, color: '#999' }}>{account.branchName}</div>}
    </div>
  );
};

export default BankAccountFieldControl;
