/**
 * 目标管理 - 弹窗状态 + 脏状态追踪 Hook
 * 管理弹窗开关、预加载逻辑、脏状态追踪、wrapped actions
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { CustomerTarget } from '@/types/target-management';
import type { SplitMethod } from '@/types/target-management';

/** useTargetActions 提供的编辑操作接口 */
interface TargetEditActions {
  handleUpdateProduct: (customerId: number, catId: string, prodId: string, field: 'targetAmount' | 'remark', value: number | string) => void;
  handleUpdateCategoryRemark: (customerId: number, catId: string, remark: string) => void;
  handleAddCustomers: (customers: Array<{ customerId: number; customerName: string }>) => void;
  handleRemoveCustomer: (customerId: number) => void;
  handleAddProducts: (customerId: number, products: Array<{ productId: string; productName: string; categoryId: string; categoryName: string; unit: string; unitPrice: number }>) => void;
  handleSplit: (customerId: number, catId: string, method: SplitMethod, targetAmount: number) => void;
}

interface UseTargetModalStateParams {
  customers: CustomerTarget[];
  selectedMarketerId: number | null;
  isHistoryMonth: boolean;
  canEdit: boolean;
  loading: boolean;
  productCatalog: unknown[];
  loadCustomerList: (marketerId?: number) => void;
  loadProductCatalog: () => Promise<void>;
  actions: TargetEditActions;
  handleSave: () => Promise<boolean>;
}

export function useTargetModalState({
  customers,
  selectedMarketerId,
  isHistoryMonth,
  canEdit,
  loading,
  productCatalog,
  loadCustomerList,
  loadProductCatalog,
  actions,
  handleSave: originalHandleSave,
}: UseTargetModalStateParams) {
  // 弹窗状态
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [productModalCategory, setProductModalCategory] = useState<{
    categoryId: string;
    categoryName: string;
  } | null>(null);

  // 脏状态追踪
  const savedSnapshotRef = useRef(customers);
  const [dirtyVersion, setDirtyVersion] = useState(0);

  const markDirty = useCallback(() => setDirtyVersion((v) => v + 1), []);

  // 数据加载完成后同步快照（检测 loading: true → false 的转换）
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !loading && selectedMarketerId) {
      savedSnapshotRef.current = customers;
      markDirty();
    }
    prevLoadingRef.current = loading;
  }, [loading, customers, selectedMarketerId, markDirty]);

  const isDirty = customers !== savedSnapshotRef.current
    && !!selectedMarketerId
    && !isHistoryMonth
    && canEdit;

  const handleSave = useCallback(async (): Promise<boolean> => {
    const success = await originalHandleSave();
    if (success) {
      savedSnapshotRef.current = customers;
      markDirty();
    }
    return success;
  }, [originalHandleSave, customers, markDirty]);

  // 弹窗操作
  const handleOpenCustomerModal = useCallback(() => {
    setCustomerModalVisible(true);
    loadCustomerList(selectedMarketerId ?? undefined);
  }, [loadCustomerList, selectedMarketerId]);

  const handleOpenProductModal = useCallback(
    async (customerId: number, categoryId: string, categoryName: string) => {
      if (productCatalog.length === 0) {
        await loadProductCatalog();
      }
      setProductModalCategory({ categoryId, categoryName });
      setProductModalVisible(true);
    },
    [productCatalog.length, loadProductCatalog],
  );

  const handleOpenAddCategory = useCallback(async () => {
    if (productCatalog.length === 0) {
      await loadProductCatalog();
    }
    setProductModalCategory(null);
    setProductModalVisible(true);
  }, [productCatalog.length, loadProductCatalog]);

  // 包装 actions，在每次编辑后标记脏状态
  const wrappedActions = useMemo(() => ({
    handleUpdateProduct: (...args: Parameters<typeof actions.handleUpdateProduct>) => {
      actions.handleUpdateProduct(...args);
      markDirty();
    },
    handleUpdateCategoryRemark: (...args: Parameters<typeof actions.handleUpdateCategoryRemark>) => {
      actions.handleUpdateCategoryRemark(...args);
      markDirty();
    },
    handleAddCustomers: (...args: Parameters<typeof actions.handleAddCustomers>) => {
      actions.handleAddCustomers(...args);
      markDirty();
    },
    handleRemoveCustomer: (...args: Parameters<typeof actions.handleRemoveCustomer>) => {
      actions.handleRemoveCustomer(...args);
      markDirty();
    },
    handleAddProducts: (...args: Parameters<typeof actions.handleAddProducts>) => {
      actions.handleAddProducts(...args);
      markDirty();
    },
    handleSplit: (...args: Parameters<typeof actions.handleSplit>) => {
      actions.handleSplit(...args);
      markDirty();
    },
  }), [actions, markDirty]);

  return {
    customerModalVisible,
    setCustomerModalVisible,
    productModalVisible,
    setProductModalVisible,
    productModalCategory,
    setProductModalCategory,
    isDirty,
    handleSave,
    handleOpenCustomerModal,
    handleOpenProductModal,
    handleOpenAddCategory,
    wrappedActions,
  };
}
