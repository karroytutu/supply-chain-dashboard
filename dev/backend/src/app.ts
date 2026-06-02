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
import returnPenaltyRoutes from './routes/return-penalty.routes';
import arCollectionRoutes from './routes/ar-collection.routes';
import arAssessmentRoutes from './routes/ar-assessment.routes';
import assessmentRoutes from './routes/assessment.routes';
import creditLicenseRoutes from './routes/credit-license.routes';
import oaRoutes from './routes/oa.routes';
import dingtalkSyncRoutes from './routes/dingtalk-sync.routes';
import { errorHandler, requestLogger } from './middleware/errorHandler';
import { startScheduler } from './services/scheduler';
import logger from './utils/logger';
import { runMigrations } from './db/migrate';
import { appQuery } from './db/appPool';

// 全局异常处理 - 确保崩溃原因在 Docker 日志中可见
process.on('uncaughtException', (error) => {
  // console.error 作为安全网，确保即使 logger 故障，错误也能写入 Docker 日志
  console.error('[FATAL] Uncaught Exception:', error?.message || error);
  console.error('[FATAL] Stack:', error?.stack || 'No stack trace');
  logger.error('[FATAL] Uncaught Exception:', error);
  // 延迟退出，给日志 1 秒 flush 时间
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  const reasonMsg = reason instanceof Error ? reason.message : String(reason);
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reasonMsg);
  logger.error('[FATAL] Unhandled Rejection at:', { promise, reason });
});

const app = express();

// Docker 容器通过 nginx 反向代理，需信任 proxy 头
app.set('trust proxy', 1);

// 安全中间件
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3100'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 全局限流（仅限写操作，避免读接口被误限）
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  skip: (req) => {
    // 豁免高频只读接口，这些接口每次页面加载/路由切换都会调用
    // 注意：中间件挂载在 /api 下，req.path 已去除 /api 前缀
    const readOnlyPaths = [
      '/auth/me',
      '/auth/check-env',
      '/auth/dingtalk/qrcode-config',
      '/health',
    ];
    return req.method === 'GET' && readOnlyPaths.some((p) => req.path.startsWith(p));
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
app.use('/api/ar-collection', arCollectionRoutes);
// [统一考核迁移] 旧路由已停用，由 /api/assessment 替代
// app.use('/api/ar-assessment', arAssessmentRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/credit-license', creditLicenseRoutes);
app.use('/api/oa', oaRoutes);
app.use('/api/dingtalk-sync', dingtalkSyncRoutes);

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
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Migration] 第 ${attempt}/${maxMigrationRetries} 次迁移失败: ${errMsg}`);
      if (attempt < maxMigrationRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[Migration] ${delay / 1000} 秒后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error('[Migration] 所有重试已耗尽，服务终止');
        logger.error('数据库迁移失败，服务将终止:', error);
        process.exit(1);
      }
    }
  }

  // 启动定时任务调度器
  startScheduler();
});

export default app;
