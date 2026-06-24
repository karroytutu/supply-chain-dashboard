import { beijingDate, beijingDateTime, beijingDateCompact, beijingDateOffset, formatLocalDate } from './beijingTime';

describe('beijingTime', () => {
  describe('beijingDateTime', () => {
    it('返回 YYYY-MM-DD HH:mm:ss 格式', () => {
      const result = beijingDateTime();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('beijingDate', () => {
    it('返回 YYYY-MM-DD 格式', () => {
      const result = beijingDate();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('beijingDateCompact', () => {
    it('返回 YYYYMMDD 格式', () => {
      const result = beijingDateCompact();
      expect(result).toMatch(/^\d{8}$/);
    });

    it('与 beijingDate 去掉横线一致', () => {
      expect(beijingDateCompact()).toBe(beijingDate().replace(/-/g, ''));
    });
  });

  describe('beijingDateOffset', () => {
    it('偏移 0 天等于今天的日期', () => {
      expect(beijingDateOffset(0)).toBe(beijingDate());
    });

    it('返回 YYYY-MM-DD 格式', () => {
      expect(beijingDateOffset(-7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(beijingDateOffset(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('负偏移返回过去的日期', () => {
      const today = new Date(beijingDate());
      const past = new Date(beijingDateOffset(-7));
      const diffDays = (today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(7);
    });

    it('正偏移返回未来的日期', () => {
      const today = new Date(beijingDate());
      const future = new Date(beijingDateOffset(30));
      const diffDays = (future.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(30);
    });

    it('跨月计算正确', () => {
      // 使用固定日期模拟：先 mock 一下
      const realDate = Date;
      const fixedTime = new Date('2026-01-31T12:00:00+08:00').getTime();
      global.Date = class extends realDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            super(...(args as [string]));
          }
        }
      } as DateConstructor;

      try {
        const result = beijingDateOffset(-1);
        expect(result).toBe('2026-01-30');
      } finally {
        global.Date = realDate;
      }
    });
  });

  describe('UTC 跨天边界验证', () => {
    it('UTC 23:00 时，北京时间应为次日', () => {
      // UTC 2026-06-24 23:00 = 北京 2026-06-25 07:00
      const realDate = Date;
      const utcTime = new Date('2026-06-24T23:00:00Z').getTime();
      global.Date = class extends realDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(utcTime);
          } else {
            super(...(args as [string]));
          }
        }
      } as DateConstructor;

      try {
        const result = beijingDate();
        expect(result).toBe('2026-06-25');

        const dateTime = beijingDateTime();
        expect(dateTime).toMatch(/^2026-06-25 07:00:00$/);

        const compact = beijingDateCompact();
        expect(compact).toBe('20260625');
      } finally {
        global.Date = realDate;
      }
    });

    it('UTC 16:00 时，北京时间为 00:00（当天）', () => {
      // UTC 2026-06-24 16:00 = 北京 2026-06-25 00:00
      const realDate = Date;
      const utcTime = new Date('2026-06-24T16:00:00Z').getTime();
      global.Date = class extends realDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(utcTime);
          } else {
            super(...(args as [string]));
          }
        }
      } as DateConstructor;

      try {
        expect(beijingDate()).toBe('2026-06-25');
      } finally {
        global.Date = realDate;
      }
    });
  });

  describe('formatLocalDate', () => {
    it('返回 YYYY-MM-DD 格式', () => {
      const date = new Date(2026, 5, 25); // 月份从 0 开始，5 = June
      expect(formatLocalDate(date)).toBe('2026-06-25');
    });

    it('单位数月自动补零', () => {
      const date = new Date(2026, 0, 5); // 1 月 5 日
      expect(formatLocalDate(date)).toBe('2026-01-05');
    });

    it('避免 toISOString 的 UTC 偏移', () => {
      // 模拟一个本地时间 2026-06-25 02:00 的 Date
      // toISOString() 会输出 UTC 时间导致日期变为 6-24
      const date = new Date(2026, 5, 25, 2, 0, 0);
      expect(formatLocalDate(date)).toBe('2026-06-25');
    });
  });
});
