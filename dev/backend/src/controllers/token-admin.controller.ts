/**
 * Token 管理 - 控制器
 * @module controllers/token-admin.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('TokenAdmin');

import { Request, Response } from 'express';
import {
  getAllTokensStatus,
  performErpLoginAndSave,
  performWmsLoginAndSave,
  performB2bExchangeAndSave,
  verifyErpToken,
  verifyWmsToken,
  verifyB2bToken,
  type TokenSystem,
} from '../services/token-manager';
import * as tokenRepo from '../services/token-manager/token-repository';
import { buildSuccessResponse, buildErrorResponse, buildPagedResponse } from '../utils/response';

/** system 参数白名单 */
const VALID_SYSTEMS: readonly TokenSystem[] = ['erp', 'wms', 'b2b'];

/** 获取三系统 Token 状态 */
export const getTokenStatusController = async (_req: Request, res: Response) => {
  try {
    const status = await getAllTokensStatus();
    res.json(buildSuccessResponse(status));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '获取 Token 状态失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 获取操作日志（分页） */
export const getTokenLogsController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const systemRaw = req.query.system as string | undefined;

    // 白名单校验 system 参数
    let system: TokenSystem | undefined;
    if (systemRaw) {
      if (!VALID_SYSTEMS.includes(systemRaw as TokenSystem)) {
        return res
          .status(400)
          .json(buildErrorResponse(400, `无效的 system 参数，可选值: ${VALID_SYSTEMS.join(', ')}`));
      }
      system = systemRaw as TokenSystem;
    }

    const result = await tokenRepo.getOperationLogs({
      page,
      pageSize: Math.min(pageSize, 100),
      system,
    });

    res.json(buildPagedResponse(result.rows, result.total, page, pageSize));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '获取操作日志失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 触发 ERP 登录（异步执行，立即返回） */
export const triggerErpLoginController = async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  // 异步执行，不阻塞响应
  performErpLoginAndSave(userId).catch(error => {
    log.error('ERP 登录异步任务失败:', error);
  });

  res.json(
    buildSuccessResponse(
      { message: 'ERP 登录任务已触发，请查看操作日志获取结果' },
      'ERP 登录任务已启动'
    )
  );
};

/** 触发 WMS 登录 */
export const triggerWmsLoginController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const smsCode = req.body.smsCode as string | undefined;

    const success = await performWmsLoginAndSave(smsCode, userId);

    if (success) {
      res.json(buildSuccessResponse({ message: 'WMS 登录成功' }));
    } else {
      // 检查是否因为需要短信验证码
      const wmsRecord = await tokenRepo.getTokenRecord('wms');
      if (wmsRecord?.needs_sms) {
        res.json(
          buildSuccessResponse({
            needsSms: true,
            message: '已发送短信验证码，请输入验证码完成登录',
          })
        );
      } else {
        res.status(400).json(buildErrorResponse(400, 'WMS 登录失败，请查看操作日志'));
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'WMS 登录失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 提交 WMS 短信验证码 */
export const submitWmsSmsCodeController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json(buildErrorResponse(400, '请提供短信验证码'));
    }

    const success = await performWmsLoginAndSave(code, userId);

    if (success) {
      res.json(buildSuccessResponse({ message: 'WMS 登录成功' }));
    } else {
      res.status(400).json(buildErrorResponse(400, '验证码错误或登录失败'));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '提交验证码失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 触发 B2B Token 兑换 */
export const triggerB2bExchangeController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const success = await performB2bExchangeAndSave(userId);

    if (success) {
      res.json(buildSuccessResponse({ message: 'B2B Token 兑换成功' }));
    } else {
      res.status(400).json(buildErrorResponse(400, 'B2B Token 兑换失败，请查看操作日志'));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'B2B 兑换失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 验证 ERP Token 有效性 */
export const verifyErpTokenController = async (_req: Request, res: Response) => {
  try {
    const token = await tokenRepo.getTokenValue('erp');
    if (!token) {
      return res.json(buildSuccessResponse({ valid: false, message: 'ERP Token 不存在' }));
    }

    const isValid = await verifyErpToken(token);
    res.json(buildSuccessResponse({ valid: isValid }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '验证失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 验证 WMS Token 有效性 */
export const verifyWmsTokenController = async (_req: Request, res: Response) => {
  try {
    const token = await tokenRepo.getTokenValue('wms');
    if (!token) {
      return res.json(buildSuccessResponse({ valid: false, message: 'WMS Session 不存在' }));
    }

    const isValid = await verifyWmsToken(token);
    res.json(buildSuccessResponse({ valid: isValid }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '验证失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};

/** 验证 B2B Token 有效性 */
export const verifyB2bTokenController = async (_req: Request, res: Response) => {
  try {
    const token = await tokenRepo.getTokenValue('b2b');
    if (!token) {
      return res.json(buildSuccessResponse({ valid: false, message: 'B2B Token 不存在' }));
    }

    const isValid = await verifyB2bToken(token);
    res.json(buildSuccessResponse({ valid: isValid }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '验证失败';
    res.status(500).json(buildErrorResponse(500, msg));
  }
};
