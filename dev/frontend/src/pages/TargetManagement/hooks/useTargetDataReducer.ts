/**
 * 目标管理 - 数据加载 Reducer
 * 管理目标数据加载的状态机
 */
import type { TargetStatus, CustomerTarget } from '@/types/target-management';
import type {
  MarketerItem,
  CustomerListItem,
  ProductCatalogItem,
  OverviewResponse,
} from '@/services/api/sales-target';

export interface DataState {
  loading: boolean;
  marketers: MarketerItem[];
  marketersLoaded: boolean;
  overviewData: OverviewResponse | null;
  currentTargetId: number | null;
  targetStatus: TargetStatus;
  customers: CustomerTarget[];
  customerList: CustomerListItem[];
  customerListLoading: boolean;
  productCatalog: ProductCatalogItem[];
  currentUser: { id: number; role: 'manager' | 'marketer' } | null;
}

export type DataAction =
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_MARKETERS'; marketers: MarketerItem[] }
  | { type: 'SET_OVERVIEW'; data: OverviewResponse | null }
  | { type: 'SET_TARGET_ID'; id: number | null }
  | { type: 'SET_TARGET_STATUS'; status: TargetStatus }
  | { type: 'SET_CUSTOMERS'; customers: CustomerTarget[] }
  | { type: 'SET_CUSTOMERS_FN'; updater: (prev: CustomerTarget[]) => CustomerTarget[] }
  | { type: 'SET_CUSTOMER_LIST'; list: CustomerListItem[]; loading: boolean }
  | { type: 'SET_PRODUCT_CATALOG'; catalog: ProductCatalogItem[] }
  | { type: 'SET_CURRENT_USER'; user: { id: number; role: 'manager' | 'marketer' } | null };

export const initialState: DataState = {
  loading: false,
  marketers: [],
  marketersLoaded: false,
  overviewData: null,
  currentTargetId: null,
  targetStatus: 'draft',
  customers: [],
  customerList: [],
  customerListLoading: false,
  productCatalog: [],
  currentUser: null,
};

export function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_MARKETERS':
      return { ...state, marketers: action.marketers, marketersLoaded: true };
    case 'SET_OVERVIEW':
      return { ...state, overviewData: action.data };
    case 'SET_TARGET_ID':
      return { ...state, currentTargetId: action.id };
    case 'SET_TARGET_STATUS':
      return { ...state, targetStatus: action.status };
    case 'SET_CUSTOMERS':
      return { ...state, customers: action.customers };
    case 'SET_CUSTOMERS_FN':
      return { ...state, customers: action.updater(state.customers) };
    case 'SET_CUSTOMER_LIST':
      return { ...state, customerList: action.list, customerListLoading: action.loading };
    case 'SET_PRODUCT_CATALOG':
      return { ...state, productCatalog: action.catalog };
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.user };
    default:
      return state;
  }
}
