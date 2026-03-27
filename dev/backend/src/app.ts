import express from 'express';
import cors from 'cors';
import { config } from './config';
import routes from './routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';
import permissionRoutes from './routes/permission.routes';
import strategicProductRoutes from './routes/strategic-product.routes';
import returnOrderRoutes from './routes/return-order.routes';
import goodsReturnRulesRoutes from './routes/goods-return-rules.routes';
import { errorHandler, requestLogger } from './middleware/errorHandler';
import { startScheduler } from './services/scheduler';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// 路由
app.use('/api', routes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/strategic-products', strategicProductRoutes);
app.use('/api/return-orders', returnOrderRoutes);
app.use('/api/goods-return-rules', goodsReturnRulesRoutes);

// 错误处理
app.use(errorHandler);

// 启动服务器
app.listen(config.port, () => {
  console.log(`服务器已启动: http://localhost:${config.port}`);
  console.log(`API 文档: http://localhost:${config.port}/api/health`);

  // 启动定时任务调度器
  startScheduler();
});

export default app;
