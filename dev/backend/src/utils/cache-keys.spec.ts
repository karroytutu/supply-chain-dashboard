import { CACHE_KEY } from './cache-keys';

describe('CACHE_KEY', () => {
  describe('static keys', () => {
    it('returns overview stats key', () => {
      expect(CACHE_KEY.OVERVIEW_STATS).toBe('overview:stats:summary');
    });

    it('returns strategic product keys', () => {
      expect(CACHE_KEY.STRATEGIC_PRODUCT_IDS).toBe('strategic:product:ids');
      expect(CACHE_KEY.STRATEGIC_PRODUCT_LIST).toBe('strategic:product:list');
    });

    it('returns ar collection keys', () => {
      expect(CACHE_KEY.AR_COLLECTION_TASKS).toBe('ar:collection:tasks');
      expect(CACHE_KEY.AR_COLLECTION_STATS).toBe('ar:collection:stats');
    });

    it('returns permission tree key', () => {
      expect(CACHE_KEY.PERMISSION_TREE).toBe('permission:tree:full');
    });

    it('returns ERP data keys', () => {
      expect(CACHE_KEY.ERP_DEBTS_ALL).toBe('erp:debts:all');
      expect(CACHE_KEY.ERP_PRODUCTS_ALL).toBe('erp:products:all');
      expect(CACHE_KEY.ERP_INVENTORY_ALL).toBe('erp:inventory:all');
      expect(CACHE_KEY.ERP_SALES_RECENT).toBe('erp:sales:recent');
      expect(CACHE_KEY.ERP_SALES_HISTORY).toBe('erp:sales:history');
      expect(CACHE_KEY.ERP_BATCH_INVENTORY).toBe('erp:batch:inventory');
      expect(CACHE_KEY.ERP_SALES_LAST_SALE).toBe('erp:sales:last_sale');
    });

    it('returns facade keys', () => {
      expect(CACHE_KEY.ERP_FACADE_PRODUCTS_WITH_STOCK).toBe('erp:facade:products_with_stock');
      expect(CACHE_KEY.ERP_FACADE_CATEGORY_AGG).toBe('erp:facade:category_agg');
    });

    it('returns prefix keys', () => {
      expect(CACHE_KEY.RETURN_ORDER_PREFIX).toBe('return:order');
      expect(CACHE_KEY.STRATEGIC_PRODUCT_PREFIX).toBe('strategic:product');
      expect(CACHE_KEY.AR_COLLECTION_PREFIX).toBe('ar:collection');
    });
  });

  describe('dynamic keys', () => {
    it('generates overview trend key', () => {
      expect(CACHE_KEY.OVERVIEW_TREND(7)).toBe('overview:trend:7');
      expect(CACHE_KEY.OVERVIEW_TREND(30)).toBe('overview:trend:30');
    });

    it('generates permission user key', () => {
      expect(CACHE_KEY.PERMISSION_USER(42)).toBe('permission:user:42');
    });

    it('generates customer search key', () => {
      expect(CACHE_KEY.ERP_CUSTOMER_SEARCH('abc')).toBe('erp:customer:search:abc');
    });

    it('generates customer profile key', () => {
      expect(CACHE_KEY.ERP_CUSTOMER_PROFILE('C001')).toBe('erp:customer:profile:C001');
      expect(CACHE_KEY.ERP_CUSTOMER_PROFILE(123)).toBe('erp:customer:profile:123');
    });

    it('generates settlement hoard key', () => {
      expect(CACHE_KEY.SETTLEMENT_HOARD('T001')).toBe('erp:settlement:hoard:T001');
    });

    it('generates ERP snapshot key', () => {
      expect(CACHE_KEY.ERP_SNAPSHOT('2026-01')).toBe('erp:snapshot:2026-01');
    });

    it('generates ERP stock cost key', () => {
      expect(CACHE_KEY.ERP_STOCK_COST('2026-06')).toBe('erp:stock:cost:2026-06');
    });

    it('generates workspace data key', () => {
      expect(CACHE_KEY.WORKSPACE_DATA(5)).toBe('workspace:data:5');
    });
  });
});
