/**
 * ERP 分页工具单元测试
 * @module services/erp-client/erp-pagination.spec.ts
 */

import { fetchAllPagesParallel, fetchAllPagesSequential, PageResult } from './erp-pagination';

describe('fetchAllPagesParallel', () => {
  it('单页数据（total <= pageSize）时只请求一次', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValue({ records: [{ id: 1 }, { id: 2 }], total: 2 });

    const result = await fetchAllPagesParallel(fetchPage, 10);

    expect(result).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('第一页 records.length < pageSize 时提前返回', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValue({ records: [{ id: 1 }], total: 100 }); // total=100 但只返回 1 条

    const result = await fetchAllPagesParallel(fetchPage, 10);

    expect(result).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('多页数据：先请求第 1 页，再并行请求剩余页', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValueOnce({ records: [{ id: 1 }, { id: 2 }], total: 6 })
      .mockResolvedValueOnce({ records: [{ id: 3 }, { id: 4 }], total: 6 })
      .mockResolvedValueOnce({ records: [{ id: 5 }, { id: 6 }], total: 6 });

    const result = await fetchAllPagesParallel(fetchPage, 2);

    expect(result).toHaveLength(6);
    expect(result.map(r => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('maxParallel 参数限制并行批次大小', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValueOnce({ records: [{ id: 1 }], total: 4 }) // page 1
      .mockResolvedValueOnce({ records: [{ id: 2 }], total: 4 }) // page 2
      .mockResolvedValueOnce({ records: [{ id: 3 }], total: 4 }) // page 3
      .mockResolvedValueOnce({ records: [{ id: 4 }], total: 4 }); // page 4

    // maxParallel=1：剩余页逐批执行（每批1页）
    const result = await fetchAllPagesParallel(fetchPage, 1, 1);

    expect(result).toHaveLength(4);
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it('total=0 且 records=[] 时返回空数组', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValue({ records: [], total: 0 });

    const result = await fetchAllPagesParallel(fetchPage, 10);

    expect(result).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('fetchPage 抛出异常时向上传播', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockRejectedValue(new Error('网络错误'));

    await expect(fetchAllPagesParallel(fetchPage, 10)).rejects.toThrow('网络错误');
  });
});

describe('fetchAllPagesSequential', () => {
  it('逐页串行请求直到 records.length < pageSize', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValueOnce({ records: [{ id: 1 }, { id: 2 }], total: 5 }) // page 1: 2 条
      .mockResolvedValueOnce({ records: [{ id: 3 }, { id: 4 }], total: 0 }) // page 2: 2 条，total=0 忽略
      .mockResolvedValueOnce({ records: [{ id: 5 }], total: 0 }); // page 3: 1 条 < pageSize

    const result = await fetchAllPagesSequential(fetchPage, 2);

    expect(result).toHaveLength(5);
    expect(result.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('knownTotal 达到后提前终止', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValueOnce({ records: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 3 })
      .mockResolvedValueOnce({ records: [{ id: 4 }], total: 0 }); // 不应被调用

    const result = await fetchAllPagesSequential(fetchPage, 3);

    // 第一页 3 条 >= knownTotal(3)，终止
    expect(result).toHaveLength(3);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('第一页 total=0 时依赖 pageSize 判断终止', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValue({ records: [], total: 0 });

    const result = await fetchAllPagesSequential(fetchPage, 10);

    expect(result).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('空数据时第一页 records=[] 即终止', async () => {
    const fetchPage = jest.fn<Promise<PageResult<{ id: number }>>, [number]>()
      .mockResolvedValue({ records: [], total: 0 });

    const result = await fetchAllPagesSequential(fetchPage, 10);

    expect(result).toHaveLength(0);
  });
});
