jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/ar-collection', () => ({
  submitVerify: jest.fn(),
  applyExtension: jest.fn(),
  markDifference: jest.fn(),
  escalateTask: jest.fn(),
  confirmVerify: jest.fn(),
  resolveDifference: jest.fn(),
  rollbackEscalation: jest.fn(),
  sendCollectionNotice: jest.fn(),
  fileLawsuit: jest.fn(),
  updateLegalProgress: jest.fn(),
}));

jest.mock('../middleware/upload', () => ({
  getFileUrl: jest.fn((filename: string) => `/uploads/ar-evidence/${filename}`),
}));

jest.mock('../services/ar-collection/ar-collection.mapper', () => ({
  fromExtensionDTO: jest.fn((body, taskId, opId, opName) => ({ ...body, taskId, opId, opName })),
  fromDifferenceDTO: jest.fn((body, taskId, opId, opName) => ({ ...body, taskId, opId, opName })),
  fromEscalateDTO: jest.fn((body, taskId, opId, opName) => ({ ...body, taskId, opId, opName })),
  fromResolveDifferenceDTO: jest.fn((body, taskId, opId, opName) => ({ ...body, taskId, opId, opName })),
  fromRollbackDTO: jest.fn((body, taskId, opId, opName) => ({ ...body, taskId, opId, opName })),
}));

jest.mock('../utils/response', () => {
  const actual = jest.requireActual('../utils/response');
  return { ...actual };
});

import {
  submitVerify,
  applyExtension,
  markDifference,
  escalateTask,
  confirmVerify,
  resolveDifference,
  rollbackEscalation,
  sendNotice,
  fileLawsuit,
  updateLegalProgress,
  uploadEvidence,
} from './ar-collection-mutation.controller';
import {
  submitVerify as submitVerifyService,
  applyExtension as applyExtensionService,
  markDifference as markDifferenceService,
  escalateTask as escalateTaskService,
  confirmVerify as confirmVerifyService,
  resolveDifference as resolveDifferenceService,
  rollbackEscalation as rollbackEscalationService,
  sendCollectionNotice,
  fileLawsuit as fileLawsuitService,
  updateLegalProgress as updateLegalProgressService,
} from '../services/ar-collection';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

const userReq = () =>
  createMockRequest({ user: { userId: 1, name: 'test', roles: ['marketer'] } });

describe('submitVerify', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'abc' } });
    const res = createMockResponse();
    await submitVerify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功申请核销', async () => {
    (submitVerifyService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['marketer'] },
      body: { amount: 100 },
    });
    const res = createMockResponse();
    await submitVerify(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });

  it('服务异常时调用 handleMutationError', async () => {
    (submitVerifyService as jest.Mock).mockRejectedValueOnce(new Error('任务不存在'));
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['marketer'] },
      body: {},
    });
    const res = createMockResponse();
    await submitVerify(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('applyExtension', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await applyExtension(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功申请延期', async () => {
    (applyExtensionService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '5' },
      user: { userId: 1, name: 'test', roles: ['marketer'] },
      body: { days: 7 },
    });
    const res = createMockResponse();
    await applyExtension(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('markDifference', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await markDifference(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功标记差异', async () => {
    (markDifferenceService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['marketer'] },
      body: { reason: 'diff' },
    });
    const res = createMockResponse();
    await markDifference(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('escalateTask', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await escalateTask(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功升级', async () => {
    (escalateTaskService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['marketer'] },
      body: { reason: 'esc' },
    });
    const res = createMockResponse();
    await escalateTask(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('rollbackEscalation', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await rollbackEscalation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功退回', async () => {
    (rollbackEscalationService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['admin'] },
      body: { reason: 'rollback' },
    });
    const res = createMockResponse();
    await rollbackEscalation(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('confirmVerify', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await confirmVerify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('confirmed 非布尔返回 400', async () => {
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['cashier'] },
      body: { confirmed: 'yes' },
    });
    const res = createMockResponse();
    await confirmVerify(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功确认核销', async () => {
    (confirmVerifyService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['cashier'] },
      body: { confirmed: true },
    });
    const res = createMockResponse();
    await confirmVerify(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('resolveDifference', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await resolveDifference(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功差异解决', async () => {
    (resolveDifferenceService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['admin'] },
      body: { action: 'resolve' },
    });
    const res = createMockResponse();
    await resolveDifference(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('sendNotice', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await sendNotice(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功发送催收函', async () => {
    (sendCollectionNotice as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['marketer'] },
      body: { description: 'notice', attachmentUrl: 'http://example.com/file.pdf' },
    });
    const res = createMockResponse();
    await sendNotice(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('fileLawsuit', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await fileLawsuit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功提起诉讼', async () => {
    (fileLawsuitService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['admin'] },
      body: { description: 'suit' },
    });
    const res = createMockResponse();
    await fileLawsuit(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('updateLegalProgress', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await updateLegalProgress(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功更新法律进展', async () => {
    (updateLegalProgressService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({
      params: { id: '1' },
      user: { userId: 1, name: 'test', roles: ['admin'] },
      body: { description: 'progress' },
    });
    const res = createMockResponse();
    await updateLegalProgress(req, res);
    expect(res.json).toHaveBeenCalledWith({ code: 200, message: 'success', data: null });
  });
});

describe('uploadEvidence', () => {
  it('未上传文件返回 400', async () => {
    const req = createMockRequest();
    (req as any).file = undefined;
    const res = createMockResponse();
    await uploadEvidence(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功上传文件', async () => {
    const req = createMockRequest();
    (req as any).file = {
      filename: 'evidence-123.jpg',
      originalname: 'receipt.jpg',
      size: 1024,
    };
    const res = createMockResponse();
    await uploadEvidence(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 200,
        data: expect.objectContaining({
          filename: 'evidence-123.jpg',
          originalName: 'receipt.jpg',
          size: 1024,
        }),
      })
    );
  });
});
