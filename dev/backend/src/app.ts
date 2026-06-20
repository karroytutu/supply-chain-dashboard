/* eslint-disable no-console */
// app.ts: 进程生命周期管理，console 用于 FATAL 异常和优雅关闭（logger 可能未初始化）
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import routes from './routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';
import permissionRoutes from './routes/permission.routes';
import strategicProductRoutes from './routes/strategic-product.routes';
import returnOrderRoutes from './routes/return-order.routes';
import goodsReturnRulesRoutes from './routes/goods-return-rules.routes';
import procurementArchiveRoutes from './routes/procurement-archive.routes';

import assessmentRoutes from './routes/assessment.routes';
import creditLicenseRoutes from './routes/credit-license.routes';
import oaRoutes from './routes/oa.routes';
import dingtalkSyncRoutes from './routes/dingtalk-sync.routes';
import tokenAdminRoutes from './routes/token-admin.routes';
import arDashboardRoutes from './routes/ar-dashboard.routes';
import orgRoutes from './routes/org.routes';
import changelogRoutes from './routes/changelog.routes';
import devErpCleanupRoutes from './routes/dev-erp-cleanup.routes';
import { errorHandler, requestLogger } from './middleware/errorHandler';
import { startScheduler } from './services/scheduler';
import { startDingtalkStream, stopDingtalkStream } from './services/dingtalk-stream.service';
import { registerSyncEventHandlers } from './services/dingtalk-sync/dingtalk-sync-events';
import logger from './utils/logger';
import { runMigrations } from './db/migrate';
import { appQuery } from './db/appPool';
import { getErrorMessage } from './utils/errorUtils';

// 防止 EPIPE (Broken Pipe) 错误导致进程崩溃
// 当父进程关闭输出管道时（如后台启动的 shell 退出），stdout/stderr 写入会触发 EPIPE
// 直接忽略这些错误，避免进入 uncaughtException 处理器
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

// 全局异常处理 - 确保崩溃原因在 Docker 日志中可见
process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  // EPIPE (Broken Pipe) 通常发生在父进程关闭输出管道时（如后台启动的 shell 退出）
  // 此时 console 写入会失败，不应尝试记录，直接静默退出
  if (error?.code === 'EPIPE' || error?.errno === -32) {
    // 尝试用 logger 写入文件（不依赖 stdout），失败则忽略
    try {
      logger.error('[EPIPE] Broken pipe, process exiting');
    } catch {
      /* ignore */
    }
    setTimeout(() => process.exit(0), 100);
    return;
  }
  // 其他异常：尝试记录，但用 try-catch 防止 console 故障导致递归崩溃
  try {
    console.error('[FATAL] Uncaught Exception:', error?.message || error);
    console.error('[FATAL] Stack:', error?.stack || 'No stack trace');
  } catch {
    /* console 写入失败，忽略 */
  }
  try {
    logger.error('[FATAL] Uncaught Exception:', error);
  } catch {
    /* ignore */
  }
  // 延迟退出，给日志 1 秒 flush 时间
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  const reasonMsg = reason instanceof Error ? reason.message : String(reason);
  // EPIPE 相关 rejection 静默处理
  if (reasonMsg.includes('EPIPE') || (reason as NodeJS.ErrnoException)?.code === 'EPIPE') {
    return;
  }
  try {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reasonMsg);
  } catch {
    /* console 写入失败，忽略 */
  }
  try {
    logger.error('[FATAL] Unhandled Rejection at:', { promise, reason });
  } catch {
    /* ignore */
  }
});

const app = express();

// Docker 容器通过 nginx 反向代理，需信任 proxy 头
app.set('trust proxy', 1);

// 安全中间件
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3100',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 全局限流（仅限写操作，避免读接口被误限）
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  skip: req => {
    // 豁免高频只读接口，这些接口每次页面加载/路由切换都会调用
    // 注意：中间件挂载在 /api 下，req.path 已去除 /api 前缀
    const readOnlyPaths = [
      '/auth/me',
      '/auth/check-env',
      '/auth/dingtalk/qrcode-config',
      '/health',
      '/changelog',
    ];
    return req.method === 'GET' && readOnlyPaths.some(p => req.path.startsWith(p));
  },
});
app.use('/api', globalLimiter);

app.use(express.json());
app.use(requestLogger);

// 静态文件服务（上传文件访问）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 路由
app.use('/api', routes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/strategic-products', strategicProductRoutes);
app.use('/api/return-orders', returnOrderRoutes);
app.use('/api/goods-return-rules', goodsReturnRulesRoutes);
// [统一考核迁移] 旧路由已停用，由 /api/assessment 替代
// app.use('/api/return-penalty', returnPenaltyRoutes);
app.use('/api/procurement', procurementArchiveRoutes);
// [统一考核迁移] 旧路由已停用，由 /api/assessment 替代
// app.use('/api/ar-assessment', arAssessmentRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/credit-license', creditLicenseRoutes);
app.use('/api/oa', oaRoutes);
app.use('/api/dingtalk-sync', dingtalkSyncRoutes);
app.use('/api/token-admin', tokenAdminRoutes);
app.use('/api/ar-dashboard', arDashboardRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/changelog', changelogRoutes);

// 开发环境专用 ERP 清理端点（供 E2E 测试清理生产数据）
if (process.env.NODE_ENV === 'development') {
  app.use('/api/dev/erp', devErpCleanupRoutes);
}

// 错误处理
app.use(errorHandler);

// 启动服务器
app.listen(config.port, async () => {
  logger.info(`服务器已启动: http://localhost:${config.port}`);
  logger.info(`API 文档: http://localhost:${config.port}/api/health`);

  // 自动执行数据库迁移（带重试，防止短暂网络问题导致启动失败）
  const maxMigrationRetries = 3;
  for (let attempt = 1; attempt <= maxMigrationRetries; attempt++) {
    try {
      await runMigrations(appQuery);
      console.log('[Migration] 数据库迁移完成');
      break;
    } catch (error) {
      const errMsg = error instanceof Error ? getErrorMessage(error) : String(error);
      console.error(`[Migration] 第 ${attempt}/${maxMigrationRetries} 次迁移失败: ${errMsg}`);
      if (attempt < maxMigrationRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[Migration] ${delay / 1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[Migration] 所有重试已耗尽，服务终止');
        logger.error('数据库迁移失败，服务将终止:', error);
        process.exit(1);
      }
    }
  }

  // 启动定时任务调度器
  startScheduler();

  // 校验审批流程岗位编码合法性（仅日志告警，不阻断启动）
  import('./services/oa/oa-form-type.query').then(m => m.validateFormTypeRoleCodes()).catch(() => {});

  // 启动钉钉 Stream 事件总线（WebSocket 长连接）
  startDingtalkStream();
  registerSyncEventHandlers();
});

// Graceful shutdown: 捕获终止信号，优雅关闭资源
const gracefulShutdown = (signal: string) => {
  console.log(`[App] 收到 ${signal} 信号，开始优雅关闭...`);
  try {
    stopDingtalkStream();
    console.log('[App] 钉钉 Stream 连接已关闭');
  } catch (err) {
    console.error('[App] 关闭钉钉 Stream 失败:', getErrorMessage(err));
  }
  // 给进行中的请求 5 秒完成时间
  console.log('[App] 等待 5 秒让进行中的请求完成...');
  setTimeout(() => {
    console.log('[App] 进程退出');
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
