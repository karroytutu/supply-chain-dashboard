/**
 * beforeSubmit 钩子单元测试
 * 测试 4 种资产表单类型的提交前校验逻辑
 */

import { assetPurchaseFormType } from './asset-purchase';
import { assetTransferFormType } from './asset-transfer';
import { assetDisposalFormType } from './asset-disposal';
import { assetMaintenanceFormType } from './asset-maintenance';

// Mock ERP 相关依赖
jest.mock('../../fixed-asset/erp-meta-utils', () => ({
  generateApplicationNo: jest.fn().mockResolvedValue('APA20260420001'),
}));

jest.mock('../../fixed-asset/purchase-callback', () => ({
  handleAssetPurchaseNodeCallback: jest.fn(),
}));

jest.mock('../../fixed-asset/transfer-callback', () => ({
  handleAssetTransferApproved: jest.fn(),
}));

jest.mock('../../fixed-asset/disposal-callback', () => ({
  handleAssetDisposalApproved: jest.fn(),
}));

jest.mock('../../fixed-asset/maintenance-callback', () => ({
  handleAssetMaintenanceNodeCallback: jest.fn(),
}));

// =====================================================
// asset_purchase beforeSubmit
// =====================================================

describe('asset_purchase beforeSubmit', () => {
  it('正常提交时生成 applicationNo', async () => {
    const result = await assetPurchaseFormType.beforeSubmit!({}, 1);
    expect(result).toEqual({ applicationNo: 'APA20260420001' });
  });
});

// =====================================================
// asset_transfer beforeSubmit
// =====================================================

describe('asset_transfer beforeSubmit', () => {
  it('所有行都有 erpAssetId 时通过', async () => {
    const formData = {
      lines: [
        { erpAssetId: 101, assetName: '电脑A' },
        { erpAssetId: 102, assetName: '电脑B' },
      ],
    };
    const result = await assetTransferFormType.beforeSubmit!(formData, 1);
    expect(result).toEqual({});
  });

  it('行缺少 erpAssetId 时抛出错误', async () => {
    const formData = {
      lines: [
        { erpAssetId: 101, assetName: '电脑A' },
        { assetName: '未选择资产' },
      ],
    };
    await expect(assetTransferFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('第2行未选择资产，请通过资产搜索选择');
  });

  it('空行数组时抛出错误', async () => {
    const formData = { lines: [] };
    await expect(assetTransferFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('请至少添加一条资产明细');
  });

  it('lines 为 undefined 时抛出错误', async () => {
    const formData = {};
    await expect(assetTransferFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('请至少添加一条资产明细');
  });
});

// =====================================================
// asset_disposal beforeSubmit
// =====================================================

describe('asset_disposal beforeSubmit', () => {
  it('有 erpAssetId 时通过', async () => {
    const formData = { erpAssetId: 101, disposalType: 'sale', disposalReason: '测试' };
    const result = await assetDisposalFormType.beforeSubmit!(formData, 1);
    expect(result).toEqual({});
  });

  it('缺少 erpAssetId 时抛出错误', async () => {
    const formData = { disposalType: 'sale', disposalReason: '测试' };
    await expect(assetDisposalFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('请通过资产搜索选择要清理的资产');
  });

  it('hasIncome=true 但无 disposalValue 时抛出错误', async () => {
    const formData = { erpAssetId: 101, hasIncome: 'true' };
    await expect(assetDisposalFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('产生收入时必须填写处置收入金额');
  });

  it('hasIncome=true 且有 disposalValue 时通过', async () => {
    const formData = { erpAssetId: 101, hasIncome: 'true', disposalValue: 5000 };
    const result = await assetDisposalFormType.beforeSubmit!(formData, 1);
    expect(result).toEqual({});
  });

  it('hasIncome=false 时无需 disposalValue', async () => {
    const formData = { erpAssetId: 101, hasIncome: 'false' };
    const result = await assetDisposalFormType.beforeSubmit!(formData, 1);
    expect(result).toEqual({});
  });
});

// =====================================================
// asset_maintenance beforeSubmit
// =====================================================

describe('asset_maintenance beforeSubmit', () => {
  it('有 erpAssetId 且费用 >= 100 时通过', async () => {
    const formData = { erpAssetId: 101, estimatedCost: 500, description: '故障描述' };
    const result = await assetMaintenanceFormType.beforeSubmit!(formData, 1);
    expect(result).toEqual({});
  });

  it('缺少 erpAssetId 时抛出错误', async () => {
    const formData = { estimatedCost: 500, description: '故障描述' };
    await expect(assetMaintenanceFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('请通过资产搜索选择要维修的资产');
  });

  it('estimatedCost < 100 时抛出错误', async () => {
    const formData = { erpAssetId: 101, estimatedCost: 50 };
    await expect(assetMaintenanceFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('预估维修费用不能小于100元');
  });

  it('estimatedCost 为 NaN 时抛出错误', async () => {
    const formData = { erpAssetId: 101, estimatedCost: 'abc' };
    await expect(assetMaintenanceFormType.beforeSubmit!(formData, 1))
      .rejects.toThrow('预估维修费用不能小于100元');
  });

  it('estimatedCost 恰好为 100 时通过', async () => {
    const formData = { erpAssetId: 101, estimatedCost: 100 };
    const result = await assetMaintenanceFormType.beforeSubmit!(formData, 1);
    expect(result).toEqual({});
  });
});
