/**
 * Chunk 加载错误处理工具
 * 检测并自动恢复因部署更新或网络问题导致的 chunk 加载失败
 */

import { showLoadingMessage } from '@/utils/appMessage';

const RELOAD_COUNT_KEY = 'chunk_reload_count';
const RELOAD_TIME_KEY = 'chunk_reload_time';
const MAX_RELOAD_COUNT = 3;
const RESET_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟后重置计数器

/**
 * 判断错误是否为 chunk 加载失败
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  const message = error.message;
  // webpack 标准错误名
  if (name === 'ChunkLoadError') return true;
  // webpack 经典消息格式
  if (/Loading (CSS )?chunk \d+ failed/.test(message)) return true;
  // Umi/webpack 在具名分包场景下的报错
  if (/umi__plugin-layout__.*\.(async\.js|chunk\.css)/.test(message)) return true;
  if (/Loading chunk failed/i.test(message)) return true;
  // 动态 import 网络错误（部分浏览器表现）
  if (message.includes('Failed to fetch dynamically imported module')) return true;
  // 浏览器将 JS chunk 响应成 HTML 时的 MIME 报错
  if (/Expected a JavaScript-or-Wasm module script/i.test(message)) return true;
  if (/MIME type of ["']text\/html["']/.test(message)) return true;
  return false;
}

/**
 * 处理 chunk 加载错误：自动刷新页面恢复
 * - 3 次内自动刷新，显示"正在更新"提示
 * - 超过 3 次显示手动刷新按钮
 * - 距上次刷新超过 10 分钟重置计数器
 */
export function handleChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;

  const now = Date.now();
  const lastReloadTime = parseInt(sessionStorage.getItem(RELOAD_TIME_KEY) || '0', 10);
  let reloadCount = parseInt(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0', 10);

  // 超过重置间隔，重置计数器
  if (now - lastReloadTime > RESET_INTERVAL_MS) {
    reloadCount = 0;
  }

  // 达到最大重试次数，不自动刷新（由 ErrorBoundary 显示手动刷新按钮）
  if (reloadCount >= MAX_RELOAD_COUNT) {
    return true; // 返回 true 表示已识别但不再自动刷新
  }

  reloadCount += 1;
  sessionStorage.setItem(RELOAD_COUNT_KEY, String(reloadCount));
  sessionStorage.setItem(RELOAD_TIME_KEY, String(now));

  showLoadingMessage('应用已更新，正在刷新页面...', 1.5);

  setTimeout(() => {
    window.location.reload();
  }, 1500);

  return true;
}

/**
 * 注册全局错误监听，捕获 script/link 标签加载失败
 * 在 React 渲染之前调用，确保 script 加载错误也能被捕获
 */
export function initChunkErrorGlobalListener(): () => void {
  const handleError = (event: ErrorEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // 检测 script 或 link 标签加载失败
    const tagName = target.tagName?.toLowerCase();
    if (tagName === 'script' || tagName === 'link') {
      const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href;
      // 覆盖 Umi 的数字 chunk 与具名插件 chunk 两类资源
      if (src && (/\.async\.js($|\?)/.test(src) || /\.chunk\.css($|\?)/.test(src))) {
        handleChunkError(new Error(`Loading chunk failed: ${src}`));
      }
    }
  };

  // 使用 capture 阶段捕获，因为 script 错误不冒泡
  window.addEventListener('error', handleError, true);
  return () => window.removeEventListener('error', handleError, true);
}
