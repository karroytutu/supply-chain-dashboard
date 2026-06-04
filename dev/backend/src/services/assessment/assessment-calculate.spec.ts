jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('./assessment.rules', () => ({
  getMatchingRules: jest.fn(),
}));

jest.mock('./assessment.repository', () => ({
  batchUpsertRecords: jest.fn(),
}));

import { runCalculation } from './assessment-calculate';
import { getMatchingRules } from './assessment.rules';
import * as repository from './assessment.repository';

const mockGetMatchingRules = getMatchingRules as jest.Mock;
const mockBatchUpsert = (repository.batchUpsertRecords as jest.Mock);

describe('assessment-calculate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zeros when no matching rules', async () => {
    mockGetMatchingRules.mockReturnValue([]);
    const ctx = { triggerType: 'manual', category: 'ar_collection' } as any;
    const result = await runCalculation(ctx);
    expect(result).toEqual({ totalRecords: 0, newRecords: 0 });
  });

  it('executes rules and upserts results', async () => {
    const mockRule = {
      category: 'ar_collection',
      ruleType: 'tier1',
      name: 'Tier 1 Rule',
      calculate: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    };
    mockGetMatchingRules.mockReturnValue([mockRule]);
    mockBatchUpsert.mockResolvedValue(2);

    const ctx = { triggerType: 'manual' } as any;
    const result = await runCalculation(ctx);
    expect(result.totalRecords).toBe(2);
    expect(result.newRecords).toBe(2);
    expect(mockBatchUpsert).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  it('skips upsert when rule returns no results', async () => {
    const mockRule = {
      category: 'return_order',
      ruleType: 'timeout',
      name: 'Timeout Rule',
      calculate: jest.fn().mockResolvedValue([]),
    };
    mockGetMatchingRules.mockReturnValue([mockRule]);

    const result = await runCalculation({} as any);
    expect(result.totalRecords).toBe(0);
    expect(mockBatchUpsert).not.toHaveBeenCalled();
  });

  it('continues when a rule fails', async () => {
    const failingRule = {
      category: 'ar_collection',
      ruleType: 'tier1',
      name: 'Fail Rule',
      calculate: jest.fn().mockRejectedValue(new Error('calc error')),
    };
    const goodRule = {
      category: 'return_order',
      ruleType: 'tier2',
      name: 'Good Rule',
      calculate: jest.fn().mockResolvedValue([{ id: 3 }]),
    };
    mockGetMatchingRules.mockReturnValue([failingRule, goodRule]);
    mockBatchUpsert.mockResolvedValue(1);

    const result = await runCalculation({} as any);
    expect(result.totalRecords).toBe(1);
    expect(result.newRecords).toBe(1);
  });

  it('handles multiple rules', async () => {
    const rule1 = {
      category: 'ar_collection',
      ruleType: 'tier1',
      name: 'R1',
      calculate: jest.fn().mockResolvedValue([{ id: 1 }]),
    };
    const rule2 = {
      category: 'return_order',
      ruleType: 'tier2',
      name: 'R2',
      calculate: jest.fn().mockResolvedValue([{ id: 2 }, { id: 3 }]),
    };
    mockGetMatchingRules.mockReturnValue([rule1, rule2]);
    mockBatchUpsert
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const result = await runCalculation({} as any);
    expect(result.totalRecords).toBe(3);
    expect(result.newRecords).toBe(3);
  });
});
