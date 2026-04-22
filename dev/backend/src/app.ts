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
import oaApprovalRoutes from './routes/oa-approval.routes';
import dingtalkSyncRoutes from './routes/dingtalk-sync.routes';
import { errorHandler, requestLogger } from './middleware/errorHandler';
import { startScheduler } from './services/scheduler';
import logger from './utils/logger';

// 全局异常处理 - 防止未捕获的异常导致进程崩溃
process.on('uncaughtException', (error) => {
  logger.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[FATAL] Unhandled Rejection at:', { promise, reason });
});

const app = express();

// 安全中间件
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3100'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 全局限流
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
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
app.use('/api/return-penalty', returnPenaltyRoutes);
app.use('/api/procurement', procurementArchiveRoutes);
app.use('/api/ar-collection', arCollectionRoutes);
app.use('/api/ar-assessment', arAssessmentRoutes);
app.use('/api/oa-approval', oaApprovalRoutes);
app.use('/api/dingtalk-sync', dingtalkSyncRoutes);

// 错误处理
app.use(errorHandler);

// 启动服务器
app.listen(config.port, () => {
  logger.info(`服务器已启动: http://localhost:${config.port}`);
  logger.info(`API 文档: http://localhost:${config.port}/api/health`);

  // 启动定时任务调度器
  startScheduler();
});

export default app;
