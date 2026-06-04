/**
 * OA 数据管理查询单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../../utils/sqlHelpers', () => ({
  escapeLikePattern: (s: string) => s,
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

jest.mock('../oa.query', () => ({
  formatInstanceListItem: jest.fn((row: any) => ({
    id: row.id,
    instanceNo: row.instance_no,
    title: row.title,
    status: row.status,
  })),
}));

import { appQuery } from '../../../db/appPool';
import { mockQueryResult } from '../../../__tests__/helpers/mockDb';
import { getDataListAll } from './data-query';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getDataListAll', () => {
  it('无过滤条件查询全部', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 10 }])) // count
      .mockResolvedValueOnce(mockQueryResult([
        { id: 1, instance_no: 'OA-001', title: '测试审批', status: 'pending' },
      ])); // list

    const result = await getDataListAll({ page: 1, pageSize: 20 } as any);
    expect(result.total).toBe(10);
    expect(result.list).toHaveLength(1);
  });

  it('formTypeCode 过滤', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ formTypeCode: 'other_payment' } as any);
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ft.code = $1');
  });

  it('status 过滤', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ status: 'pending' } as any);
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('i.status = $1');
  });

  it('日期范围过滤', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ startDate: '2026-01-01', endDate: '2026-12-31' } as any);
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('i.submitted_at >= $');
    expect(countSql).toContain('i.submitted_at <= $');
  });

  it('keyword 模糊搜索编号和标题', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ keyword: '测试' } as any);
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('instance_no ILIKE');
    expect(countSql).toContain('title ILIKE');
  });

  it('applicantName 模糊搜索', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ applicantName: '张三' } as any);
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('applicant_name ILIKE');
  });

  it('多条件组合过滤', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({
      formTypeCode: 'other_payment',
      status: 'approved',
      keyword: '付款',
    } as any);
    const countSql = mockAppQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('ft.code');
    expect(countSql).toContain('i.status');
    expect(countSql).toContain('ILIKE');
  });

  it('分页计算正确', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 50 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ page: 3, pageSize: 10, viewMode: 'pending' } as any);
    const listParams = mockAppQuery.mock.calls[1][1] as any[];
    expect(listParams[listParams.length - 1]).toBe(20); // offset = (3-1)*10
    expect(listParams[listParams.length - 2]).toBe(10); // limit
  });

  it('默认分页参数', async () => {
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
      .mockResolvedValueOnce(mockQueryResult([]));

    await getDataListAll({ viewMode: 'pending' } as any);
    // page defaults to 1, pageSize to 20
    const listParams = mockAppQuery.mock.calls[1][1] as any[];
    expect(listParams[listParams.length - 1]).toBe(0); // offset = 0
    expect(listParams[listParams.length - 2]).toBe(20); // limit
  });
});
