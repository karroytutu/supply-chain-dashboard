/**
 * 前端轻量日志工具
 * - 开发环境：所有级别输出到 console
 * - 生产环境：仅 warn/error 输出，debug/info/log 静默
 * - 统一 [模块名] 前缀格式
 */
/* eslint-disable no-console */

const isDev = process.env.NODE_ENV === 'development';

const LEVEL_ENABLED = {
  debug: isDev,
  log: isDev,
  info: isDev,
  warn: true,
  error: true,
};

function formatArgs(module: string, args: unknown[]): unknown[] {
  const prefix = `[${module}]`;
  if (typeof args[0] === 'string') {
    return [`${prefix} ${args[0]}`, ...args.slice(1)];
  }
  return [prefix, ...args];
}

export function createLogger(module: string) {
  return {
    debug: (...args: unknown[]) => {
      if (LEVEL_ENABLED.debug) console.debug(...formatArgs(module, args));
    },
    log: (...args: unknown[]) => {
      if (LEVEL_ENABLED.log) console.log(...formatArgs(module, args));
    },
    info: (...args: unknown[]) => {
      if (LEVEL_ENABLED.info) console.info(...formatArgs(module, args));
    },
    warn: (...args: unknown[]) => {
      if (LEVEL_ENABLED.warn) console.warn(...formatArgs(module, args));
    },
    error: (...args: unknown[]) => {
      if (LEVEL_ENABLED.error) console.error(...formatArgs(module, args));
    },
  };
}

/** 默认 logger（不带模块名） */
export const logger = createLogger('App');
