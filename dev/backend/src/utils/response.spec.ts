jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import {
  sendSuccess,
  sendError,
  sendPaginatedSuccess,
  handleMutationError,
  buildSuccessResponse,
  buildErrorResponse,
  buildPagedResponse,
} from './response';

function mockRes() {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res;
}

describe('response utilities', () => {
  describe('sendSuccess', () => {
    it('sends success with default message', () => {
      const res = mockRes();
      sendSuccess(res, { id: 1 });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 }, message: 'success' });
    });

    it('sends success with custom message', () => {
      const res = mockRes();
      sendSuccess(res, null, 'ok');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: null, message: 'ok' });
    });
  });

  describe('sendError', () => {
    it('sends error with status code', () => {
      const res = mockRes();
      sendError(res, 404, 'not found');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'not found' });
    });
  });

  describe('sendPaginatedSuccess', () => {
    it('sends paginated response', () => {
      const res = mockRes();
      sendPaginatedSuccess(res, [{ id: 1 }], 10, 1, 5);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 1 }],
        total: 10,
        page: 1,
        pageSize: 5,
        totalPages: 2,
      });
    });
  });

  describe('handleMutationError', () => {
    it('returns 404 for 不存在 message', () => {
      const res = mockRes();
      handleMutationError(res, new Error('客户不存在'), 'fallback');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalled();
    });

    it('returns 400 for 不允许 message', () => {
      const res = mockRes();
      handleMutationError(res, new Error('操作不允许'), 'fallback');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for 无权 message', () => {
      const res = mockRes();
      handleMutationError(res, new Error('无权操作'), 'fallback');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for 已 message', () => {
      const res = mockRes();
      handleMutationError(res, new Error('已处理'), 'fallback');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for 不能 message', () => {
      const res = mockRes();
      handleMutationError(res, new Error('不能执行'), 'fallback');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 for unknown error', () => {
      const res = mockRes();
      handleMutationError(res, new Error('something weird'), 'fallback');
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('uses fallback message for non-Error', () => {
      const res = mockRes();
      handleMutationError(res, 'string error', 'fallback');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'fallback' }));
    });
  });

  describe('buildSuccessResponse', () => {
    it('builds success response with defaults', () => {
      expect(buildSuccessResponse({ id: 1 })).toEqual({ code: 200, message: 'success', data: { id: 1 } });
    });

    it('builds success response with custom code', () => {
      expect(buildSuccessResponse(null, 'created', 201)).toEqual({ code: 201, message: 'created', data: null });
    });
  });

  describe('buildErrorResponse', () => {
    it('builds error response', () => {
      expect(buildErrorResponse(400, 'bad')).toEqual({ code: 400, message: 'bad', data: null });
    });
  });

  describe('buildPagedResponse', () => {
    it('builds paged response', () => {
      const result = buildPagedResponse([{ id: 1 }], 20, 2, 10);
      expect(result).toEqual({
        code: 200,
        message: 'success',
        data: [{ id: 1 }],
        total: 20,
        page: 2,
        pageSize: 10,
        totalPages: 2,
      });
    });
  });
});
