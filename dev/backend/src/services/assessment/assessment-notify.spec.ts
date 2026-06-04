jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('./assessment.rules', () => ({
  getAssessmentRule: jest.fn(),
}));

jest.mock('./utils', () => ({
  getDingtalkUserIdMap: jest.fn(),
}));

jest.mock('../dingtalk.service', () => ({
  sendWorkNotification: jest.fn(),
}));

import { sendAssessmentNotifications } from './assessment-notify';
import { getAssessmentRule } from './assessment.rules';
import { getDingtalkUserIdMap } from './utils';
import { sendWorkNotification } from '../dingtalk.service';
import type { AssessmentRecordRow } from './assessment.types';

const mockGetRule = getAssessmentRule as jest.Mock;
const mockGetDingtalkMap = getDingtalkUserIdMap as jest.Mock;
const mockSend = sendWorkNotification as jest.Mock;

function makeRecord(overrides: Partial<AssessmentRecordRow> = {}): AssessmentRecordRow {
  return {
    id: 1,
    category: 'ar_collection',
    rule_type: 'tier1',
    source_type: 'ar_collection_task',
    source_id: 100,
    source_no: 'SO-001',
    source_name: '订单A',
    assessment_user_id: 10,
    assessment_user_name: '张三',
    assessment_role: 'marketer',
    base_amount: '5000',
    penalty_rate: '0.01',
    overdue_days: 5,
    penalty_amount: '50.00',
    status: 'pending',
    handle_remark: null,
    handled_by: null,
    handled_at: null,
    oa_instance_id: null,
    appeal_reason: null,
    appeal_submitted_at: null,
    rule_snapshot: null,
    calculated_at: '2026-06-01',
    ...overrides,
  } as AssessmentRecordRow;
}

describe('assessment-notify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early for empty records', async () => {
    await sendAssessmentNotifications([]);
    expect(mockGetDingtalkMap).not.toHaveBeenCalled();
  });

  it('sends notification to user with dingtalk id', async () => {
    mockGetDingtalkMap.mockResolvedValue(new Map([[10, 'dt_010']]));
    mockGetRule.mockReturnValue({ name: 'Tier 1 规则' });
    mockSend.mockResolvedValue({ errcode: 0 });

    await sendAssessmentNotifications([makeRecord()]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toEqual(['dt_010']);
  });

  it('skips user without dingtalk id', async () => {
    mockGetDingtalkMap.mockResolvedValue(new Map());
    await sendAssessmentNotifications([makeRecord()]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('groups records by user', async () => {
    mockGetDingtalkMap.mockResolvedValue(new Map([[10, 'dt_010'], [20, 'dt_020']]));
    mockGetRule.mockReturnValue({ name: 'Rule' });
    mockSend.mockResolvedValue({ errcode: 0 });

    const records = [
      makeRecord({ assessment_user_id: 10 }),
      makeRecord({ assessment_user_id: 10, id: 2 }),
      makeRecord({ assessment_user_id: 20, id: 3 }),
    ];
    await sendAssessmentNotifications(records);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('handles send failure gracefully', async () => {
    mockGetDingtalkMap.mockResolvedValue(new Map([[10, 'dt_010']]));
    mockGetRule.mockReturnValue({ name: 'Rule' });
    mockSend.mockRejectedValue(new Error('API error'));

    await sendAssessmentNotifications([makeRecord()]);
    // Should not throw
  });

  it('handles rule not found', async () => {
    mockGetDingtalkMap.mockResolvedValue(new Map([[10, 'dt_010']]));
    mockGetRule.mockReturnValue(null);
    mockSend.mockResolvedValue({ errcode: 0 });

    await sendAssessmentNotifications([makeRecord()]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
