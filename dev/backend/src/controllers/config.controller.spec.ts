import { Request, Response } from 'express';
import { getThresholds } from './config.controller';

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('Config Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {};
    res = {
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getThresholds', () => {
    it('should return all threshold configurations', () => {
      getThresholds(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 200,
          data: expect.objectContaining({
            turnover: expect.objectContaining({
              excellentDays: expect.any(Number),
              goodDays: expect.any(Number),
              attentionDays: expect.any(Number),
            }),
            overstock: expect.objectContaining({
              mildDays: expect.any(Number),
              moderateDays: expect.any(Number),
              seriousDays: expect.any(Number),
            }),
            lowStock: expect.objectContaining({
              days: expect.any(Number),
            }),
            expiring: expect.objectContaining({
              seriousDays: expect.any(Number),
              warningDays: expect.any(Number),
              attentionDays: expect.any(Number),
              rateSerious: expect.any(Number),
              rateWarning: expect.any(Number),
              rateAttention: expect.any(Number),
            }),
            slowMoving: expect.objectContaining({
              mildDays: expect.any(Number),
              moderateDays: expect.any(Number),
              seriousDays: expect.any(Number),
            }),
            arCollection: expect.objectContaining({
              extensionMaxDays: expect.any(Number),
              defaultExpireDays: expect.any(Number),
              assessmentEffectiveDate: expect.any(String),
            }),
            returnPenalty: expect.objectContaining({
              expireInsufficientDays: expect.any(Number),
            }),
          }),
        })
      );
    });
  });
});
