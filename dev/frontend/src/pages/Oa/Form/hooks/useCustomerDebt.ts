import { useState, useCallback, useEffect, useMemo } from 'react';
import { oaApi } from '@/services/api/oa';

/**
 * 客户档案修改 - 欠款状态管理
 * 当 typeCode 为 customer_modify 时，加载客户欠款并计算状态选项
 */
export function useCustomerDebt(
  typeCode: string | undefined,
  formData: Record<string, unknown>,
) {
  const [debtAmount, setDebtAmount] = useState<number | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);

  const loadCustomerDebt = useCallback(async (customerId: number) => {
    setDebtLoading(true);
    try {
      const result = await oaApi.getCustomerDebt(customerId);
      setDebtAmount(result?.debtAmount ?? null);
    } catch {
      setDebtAmount(null);
    } finally {
      setDebtLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeCode === 'customer_modify' && formData.customer) {
      loadCustomerDebt(Number(formData.customer));
    }
  }, [typeCode, formData.customer, loadCustomerDebt]);

  const customerStateOptions = useMemo(() => {
    if (typeCode !== 'customer_modify') return undefined;
    const hasDebt = debtAmount !== null && debtAmount > 0;
    return [
      { value: 1, label: '启用' },
      { value: 2, label: '待确认' },
      {
        value: 0,
        label: hasDebt ? `停用（有欠款 ¥${debtAmount.toFixed(2)}，不可停用）` : '停用',
        disabled: hasDebt,
      },
    ];
  }, [typeCode, debtAmount]);

  return { debtLoading, customerStateOptions };
}
