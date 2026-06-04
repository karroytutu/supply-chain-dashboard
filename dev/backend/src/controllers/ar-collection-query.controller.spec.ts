jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/ar-collection', () => ({
  getCollectionStats: jest.fn(),
  getCollectionTasks: jest.fn(),
  getTaskById: jest.fn(),
  getTaskDetails: jest.fn(),
  getTaskActions: jest.fn(),
  getLegalProgress: jest.fn(),
  getMyTasks: jest.fn(),
  getHandlers: jest.fn(),
  getUpcomingWarnings: jest.fn(),
  getWarningReminders: jest.fn(),
}));

jest.mock('../services/assessment', () => ({
  assessmentRepository: { getRecordsBySourceId: jest.fn() },
}));

jest.mock('../services/ar-collection/ar-collection.mapper', () => ({
  toTaskDTO: jest.fn((x) => x),
  toDetailDTO: jest.fn((x) => x),
  toActionDTO: jest.fn((x) => x),
  toLegalProgressDTO: jest.fn((x) => x),
  assessmentToActionDTO: jest.fn((x) => x),
}));

import {
  getStats,
  getTasks,
  getTaskById,
  getTaskDetails,
  getTaskActions,
  getLegalProgress,
  getMyTasks,
  getHandlers,
  getWarnings,
  getReminders,
} from './ar-collection-query.controller';
import {
  getCollectionStats,
  getCollectionTasks,
  getTaskById as getTaskByIdService,
  getTaskDetails as getTaskDetailsService,
  getTaskActions as getTaskActionsService,
  getLegalProgress as getLegalProgressService,
  getMyTasks as getMyTasksService,
  getHandlers as getHandlersService,
  getUpcomingWarnings,
  getWarningReminders,
} from '../services/ar-collection';
import { assessmentRepository } from '../services/assessment';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getStats', () => {
  it('成功获取统计', async () => {
    (getCollectionStats as jest.Mock).mockResolvedValueOnce({ total: 10 });
    const req = createMockRequest({ user: { userId: 1, roles: ['admin'] } });
    const res = createMockResponse();
    await getStats(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: { total: 10 } });
  });

  it('异常返回 500', async () => {
    (getCollectionStats as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ user: { userId: 1, roles: ['admin'] } });
    const res = createMockResponse();
    await getStats(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getTasks', () => {
  it('成功查询任务列表', async () => {
    (getCollectionTasks as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 1 }],
      total: 1,
    });
    const req = createMockRequest({
      user: { userId: 1, roles: ['admin'] },
      query: { page: '1', page_size: '20' },
    });
    const res = createMockResponse();
    await getTasks(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 200, data: expect.objectContaining({ total: 1 }) })
    );
  });

  it('异常返回 500', async () => {
    (getCollectionTasks as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ user: { userId: 1, roles: ['admin'] } });
    const res = createMockResponse();
    await getTasks(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getTaskById', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getTaskById(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('任务不存在返回 404', async () => {
    (getTaskByIdService as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({
      params: { id: '99' },
      user: { userId: 1, roles: ['admin'] },
    });
    const res = createMockResponse();
    await getTaskById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功返回任务', async () => {
    (getTaskByIdService as jest.Mock).mockResolvedValueOnce({ id: 1 });
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, roles: ['admin'] },
    });
    const res = createMockResponse();
    await getTaskById(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('getTaskDetails', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getTaskDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功返回明细', async () => {
    (getTaskDetailsService as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getTaskDetails(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('getTaskActions', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getTaskActions(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功返回操作历史', async () => {
    (getTaskActionsService as jest.Mock).mockResolvedValueOnce([
      { id: 1, createdAt: '2026-01-01' },
    ]);
    (assessmentRepository.getRecordsBySourceId as jest.Mock).mockResolvedValueOnce([
      { id: 2, createdAt: '2026-01-02' },
    ]);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getTaskActions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('getLegalProgress', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getLegalProgress(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功返回法律进展', async () => {
    (getLegalProgressService as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getLegalProgress(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('getMyTasks', () => {
  it('成功获取我的待办', async () => {
    (getMyTasksService as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest({ user: { userId: 1, roles: ['marketer'] } });
    const res = createMockResponse();
    await getMyTasks(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('异常返回 500', async () => {
    (getMyTasksService as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ user: { userId: 1, roles: ['marketer'] } });
    const res = createMockResponse();
    await getMyTasks(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getHandlers', () => {
  it('成功获取处理人列表', async () => {
    (getHandlersService as jest.Mock).mockResolvedValueOnce([{ id: 1, name: 'A' }]);
    const req = createMockRequest();
    const res = createMockResponse();
    await getHandlers(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('异常返回 500', async () => {
    (getHandlersService as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest();
    const res = createMockResponse();
    await getHandlers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getWarnings', () => {
  it('管理员可查看全部', async () => {
    (getUpcomingWarnings as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({
      user: { userId: 1, roles: ['admin'] },
      query: { page: '1' },
    });
    const res = createMockResponse();
    await getWarnings(req, res);
    expect(getUpcomingWarnings).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: undefined })
    );
  });

  it('非管理员限制查看自己', async () => {
    (getUpcomingWarnings as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({
      user: { userId: 5, roles: ['marketer'] },
      query: {},
    });
    const res = createMockResponse();
    await getWarnings(req, res);
    expect(getUpcomingWarnings).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: 5 })
    );
  });
});

describe('getReminders', () => {
  it('管理员查看全部', async () => {
    (getWarningReminders as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({
      user: { userId: 1, roles: ['admin'] },
      query: {},
    });
    const res = createMockResponse();
    await getReminders(req, res);
    expect(getWarningReminders).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: undefined })
    );
  });

  it('非管理员限制查看自己', async () => {
    (getWarningReminders as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({
      user: { userId: 3, roles: ['marketer'] },
      query: {},
    });
    const res = createMockResponse();
    await getReminders(req, res);
    expect(getWarningReminders).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: 3 })
    );
  });
});
