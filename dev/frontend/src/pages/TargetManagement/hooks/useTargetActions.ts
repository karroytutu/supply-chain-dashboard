/**
 * 目标管理 - 操作 Hook
 * 管理目标增删改保存操作
 */
import { useCallback } from 'react';
import { message } from 'antd';
import type { TargetMonth, CustomerTarget, SplitMethod } from '@/types/target-management';
import { splitByProportion, splitEvenly } from '../utils/target-calculations';
import { buildSaveItems } from '../utils/build-save-items';
import { createTarget, updateTarget } from '@/services/api/sales-target';
import type { MarketerItem } from '@/services/api/sales-target';
import { useTargetApproval } from './useTargetApproval';
import { useTargetCrudActions } from './useTargetCrudActions';

interface UseTargetActionsParams {
  customers: CustomerTarget[];
  setCustomers: (customers: CustomerTarget[] | ((prev: CustomerTarget[]) => CustomerTarget[])) => void;
  selectedMarketerId: number | null;
  marketers: MarketerItem[];
  currentTargetId: number | null;
  currentMonth: TargetMonth;
  loadTargetData: () => void;
}

export function useTargetActions({
  customers,
  setCustomers,
  selectedMarketerId,
  marketers,
  currentTargetId,
  currentMonth,
  loadTargetData,
}: UseTargetActionsParams) {
  const approval = useTargetApproval(loadTargetData);
  const crud = useTargetCrudActions({ customers, setCustomers, selectedMarketerId, marketers });

  // 更新商品目标
  const handleUpdateProduct = useCallback(
    (customerId: number, categoryId: string, productId: string, field: 'targetAmount' | 'remark', value: number | string) => {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.customerId !== customerId) return c;
          return {
            ...c,
            categories: c.categories.map((cat) => {
              if (cat.categoryId !== categoryId) return cat;
              return {
                ...cat,
                products: cat.products.map((p) => (p.productId !== productId ? p : { ...p, [field]: value })),
              };
            }),
          };
        }),
      );
    },
    [setCustomers],
  );

  // 更新品类说明
  const handleUpdateCategoryRemark = useCallback(
    (customerId: number, categoryId: string, remark: string) => {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.customerId !== customerId) return c;
          return { ...c, categories: c.categories.map((cat) => (cat.categoryId !== categoryId ? cat : { ...cat, remark })) };
        }),
      );
    },
    [setCustomers],
  );

  // 保存目标，返回 { success, targetId }
  const handleSave = useCallback(async (): Promise<{ success: boolean; targetId: number | null }> => {
    if (!selectedMarketerId) {
      message.warning('请先选择一个营销师');
      return { success: false, targetId: null };
    }

    const items = buildSaveItems(customers, selectedMarketerId);

    try {
      if (currentTargetId) {
        await updateTarget(currentTargetId, items);
        message.success('目标已更新');
        loadTargetData();
        return { success: true, targetId: currentTargetId };
      } else {
        const result = await createTarget({
          marketerId: selectedMarketerId,
          year: currentMonth.year,
          month: currentMonth.month,
          items,
        });
        message.success('目标已创建');
        loadTargetData();
        return { success: true, targetId: result.id };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '保存失败';
      message.error(errMsg);
      return { success: false, targetId: null };
    }
  }, [selectedMarketerId, customers, currentTargetId, currentMonth, loadTargetData]);

  // 拆分品类目标到商品
  const handleSplit = useCallback(
    (customerId: number, categoryId: string, method: SplitMethod, targetAmount: number) => {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.customerId !== customerId) return c;
          return { ...c, categories: c.categories.map((cat) => {
            if (cat.categoryId !== categoryId) return cat;
            const splitFn = method === 'by_proportion' ? splitByProportion : splitEvenly;
            return { ...cat, targetAmount, products: splitFn(cat, targetAmount) };
          }) };
        }),
      );
    },
    [setCustomers],
  );

  // 提交审批：先保存，再弹签名框，返回 targetId 供签名确认使用
  const handleSubmitApproval = useCallback(async (): Promise<number | null> => {
    return approval.handleSubmitApproval(handleSave);
  }, [approval.handleSubmitApproval, handleSave]);

  // 签名确认后完成审批提交（使用传入的 targetId，不依赖闭包中的 currentTargetId）
  const confirmSignature = useCallback(async (signatureData: string, targetId: number) => {
    await approval.confirmSignature(signatureData, targetId);
  }, [approval.confirmSignature]);

  // 取消签名
  const cancelSignature = useCallback(() => {
    approval.cancelSignature();
  }, [approval.cancelSignature]);

  return {
    handleUpdateProduct,
    handleUpdateCategoryRemark,
    handleSave: async () => (await handleSave()).success,
    handleSubmitApproval,
    confirmSignature,
    cancelSignature,
    submitLoading: approval.submitLoading,
    signatureModalVisible: approval.signatureModalVisible,
    setSignatureModalVisible: approval.setSignatureModalVisible,
    handleAddCustomers: crud.handleAddCustomers,
    handleRemoveCustomer: crud.handleRemoveCustomer,
    handleAddProducts: crud.handleAddProducts,
    handleSplit,
  };
}
