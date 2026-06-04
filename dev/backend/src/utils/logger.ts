import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.splat(), // 支持 %s/%d 插值（兼容 console.log 习惯）
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Console transport 在所有环境都启用，确保 Docker 容器能捕获日志
// 生产环境使用简洁格式，开发环境使用彩色格式
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.splat(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, module, ...rest }) => {
          const prefix = module ? `[${module}] ` : '';
          const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
          return `[${timestamp}] ${prefix}${level}: ${message}${extra}`;
        })
      ),
    })
  );
} else {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.splat(),
        winston.format.colorize(),
        winston.format.printf(({ level, message, module, ...rest }) => {
          const prefix = module ? `[${module}] ` : '';
          const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
          return `${prefix}${level}: ${message}${extra}`;
        })
      ),
    })
  );
}

/**
 * 创建带模块标识的 child logger
 * 自动合并多位置参数为 meta 对象，避免 Winston 静默丢弃额外参数
 * @example
 *   const log = createLogger('Scheduler');
 *   log.info('任务已启动');           // 输出: [Scheduler] 任务已启动
 *   log.error('任务失败', { error }); // 输出: [Scheduler] 任务失败 {"error":...}
 *   log.error('失败:', roleCode, error); // 自动合并为 { roleCode, error }
 */
export function createLogger(module: string) {
  const child = logger.child({ module });

  /**
   * 将多个位置参数合并为单个 meta 对象
   * - 字符串参数 → { arg1: value }
   * - Error 对象 → { error: err.message }
   * - 普通对象 → 展开合并
   */
  function mergeArgs(msg: string, ...args: unknown[]): [string, Record<string, unknown>?] {
    if (args.length === 0) return [msg];
    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !(args[0] instanceof Error)
    ) {
      return [msg, args[0] as Record<string, unknown>];
    }
    const meta: Record<string, unknown> = {};
    args.forEach((arg, i) => {
      if (arg instanceof Error) {
        meta.error = arg.message;
        meta.stack = arg.stack;
      } else if (typeof arg === 'object' && arg !== null) {
        Object.assign(meta, arg);
      } else {
        meta[`arg${i}`] = arg;
      }
    });
    return [msg, meta];
  }

  return {
    debug: (msg: string, ...args: unknown[]) => child.debug(...mergeArgs(msg, ...args)),
    info: (msg: string, ...args: unknown[]) => child.info(...mergeArgs(msg, ...args)),
    http: (msg: string, ...args: unknown[]) => child.http(...mergeArgs(msg, ...args)),
    warn: (msg: string, ...args: unknown[]) => child.warn(...mergeArgs(msg, ...args)),
    error: (msg: string, ...args: unknown[]) => child.error(...mergeArgs(msg, ...args)),
  };
}

export default logger;
