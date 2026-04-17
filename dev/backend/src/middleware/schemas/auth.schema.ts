import { z } from 'zod';

/** 钉钉自动登录验证 schema */
export const dingtalkAutoLoginSchema = z.object({
  body: z.object({
    authCode: z.string().min(1, 'authCode 不能为空'),
  }),
});

/** 钉钉回调验证 schema */
export const dingtalkCallbackSchema = z.object({
  body: z.object({
    authCode: z.string().min(1, 'authCode 不能为空'),
    state: z.string().optional(),
  }),
});

/** 开发环境登录验证 schema */
export const devLoginSchema = z.object({
  body: z.object({
    userId: z.number().int().positive('userId 必须为正整数').optional(),
    dingtalkUserId: z.string().optional(),
  }),
});
