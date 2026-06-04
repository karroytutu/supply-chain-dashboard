/**
 * 错误处理工具函数
 * 用于安全地从 unknown 类型的 catch error 中提取信息
 */

/**
 * 从 catch 的 unknown error 中安全提取错误消息
 * @param error - catch 块中的 error（unknown 类型）
 * @param fallback - 默认消息
 * @returns 错误消息字符串
 */
export function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

/**
 * 从 catch 的 unknown error 中安全提取错误对象
 * 用于需要访问 error.code、error.status 等属性的场景
 */
export function getErrorObject(error: unknown): {
  message: string;
  code?: string;
  status?: number;
  statusCode?: number;
  response?: unknown;
  data?: unknown;
} {
  if (error instanceof Error) {
    const err = error as Error & {
      code?: string;
      status?: number;
      statusCode?: number;
      response?: unknown;
      data?: unknown;
    };
    return {
      message: err.message,
      code: err.code,
      status: err.status,
      statusCode: err.statusCode,
      response: err.response,
      data: err.data,
    };
  }
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    return {
      message: String(err.message || '未知错误'),
      code: err.code as string | undefined,
      status: err.status as number | undefined,
      statusCode: err.statusCode as number | undefined,
      response: err.response,
      data: err.data,
    };
  }
  return { message: String(error || '未知错误') };
}

/** PostgreSQL 错误类型守卫 */
export function isPgError(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/** Axios HTTP 错误类型守卫 */
export function isAxiosError(
  error: unknown
): error is Error & { response: { status: number; data: unknown }; status: number } {
  return (
    error instanceof Error &&
    'response' in error &&
    typeof (error as { response: unknown }).response === 'object' &&
    (error as { response: unknown }).response !== null
  );
}
