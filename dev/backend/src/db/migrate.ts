import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createLogger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';
const log = createLogger('Database');

/**
 * 执行数据库迁移
 * @param query 数据库查询函数，需兼容 (text: string, params?: any[]) => Promise<{ rows: any[] }>
 */
export async function runMigrations(
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>
): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');

  // 检查迁移目录是否存在
  if (!fs.existsSync(migrationsDir)) {
    log.info('迁移目录不存在，创建目录...');
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  // 创建迁移历史表（如不存在）
  await query(`
    CREATE TABLE IF NOT EXISTS migrations_history (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 查询已执行的迁移
  const executedResult = await query('SELECT filename FROM migrations_history');
  const executedFiles = new Set(executedResult.rows.map((r: any) => r.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    log.info('没有找到迁移文件');
    return;
  }

  // 过滤掉已执行的迁移
  const pendingFiles = files.filter(f => !executedFiles.has(f));

  if (pendingFiles.length === 0) {
    log.info('所有迁移已执行，无需操作');
    return;
  }

  log.info(`找到 ${files.length} 个迁移文件，${pendingFiles.length} 个待执行`);

  const failedMigrations: string[] = [];

  for (const file of pendingFiles) {
    log.info(`\n执行迁移: ${file}`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await query(sql);
      // 记录迁移执行历史
      await query('INSERT INTO migrations_history (filename) VALUES ($1)', [file]);
      log.info(`完成: ${file}`);
    } catch (error) {
      log.error(`迁移失败: ${file}`);
      log.error('错误信息:', getErrorMessage(error));
      failedMigrations.push(file);
      // 不记录到 migrations_history，下次启动时自动重试
      break;  // 停止执行后续迁移，避免级联失败
    }
  }

  if (failedMigrations.length > 0) {
    log.warn(`\n迁移 ${failedMigrations[0]} 执行失败，后续迁移已中止`);
    log.warn('请检查上方错误信息，修复问题后重启应用，迁移将自动重试');
  } else {
    log.info('\n所有迁移处理完成!');
  }
}

/**
 * CLI 入口：直接运行 ts-node src/db/migrate.ts 时使用
 */
async function main() {
  // 仅在 CLI 模式下加载环境变量
  dotenv.config();

  const pool = new Pool({
    host: process.env.APP_DB_HOST || 'localhost',
    port: parseInt(process.env.APP_DB_PORT || '5432'),
    database: process.env.APP_DB_NAME || 'xly_dashboard',
    user: process.env.APP_DB_USER || 'postgres',
    password: process.env.APP_DB_PASSWORD || 'postgres',
  });

  pool.on('error', err => {
    log.error('数据库连接错误:', err);
  });

  try {
    // 测试连接
    log.info('连接数据库...');
    await pool.query('SELECT NOW()');
    log.info('数据库连接成功\n');

    // 执行迁移
    await runMigrations(pool.query.bind(pool));

    process.exit(0);
  } catch (error) {
    log.error('迁移执行失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 仅当直接运行此文件时执行 CLI 逻辑
if (require.main === module) {
  main();
}
