/**
 * 错误处理工具函数
 * 用于安全地从 unknown 类型的 catch error 中提取信息
 */

/**
 * 从 catch 的 unknown error 中安全提取错误消息
 */
export function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}
