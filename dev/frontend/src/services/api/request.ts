/**
 * API 请求封装
 * 包含 401/403 响应处理、GET 参数自动 toSnakeKeys 转换
 */
import { toSnakeKeys } from '@/utils/keyConvert';
import { showErrorMessage } from '@/utils/appMessage';

const API_BASE = '/api';
const TOKEN_KEY = 'auth_token';
/** 默认请求超时时间（30秒） */
const DEFAULT_TIMEOUT = 30000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
  /** 是否跳过错误处理 */
  skipErrorHandler?: boolean;
  /** 外部 AbortSignal，用于取消请求 */
  signal?: AbortSignal;
  /** 是否跳过 GET 参数的 camelCase → snake_case 自动转换
   * 适用于参数名由后端 API 定义（如 ERP 参考数据的 consumerId）而非数据库字段的场景 */
  skipParamsSnakeCase?: boolean;
}

/**
 * 处理认证错误
 * 根据后端返回的message区分不同错误类型，显示准确提示
 * 注意：401 时立即跳转登录页，不使用延迟，避免页面渲染为空权限状态
 */
function handleAuthError(status: number, errorData?: any): void {
  if (status === 401) {
    // Token 无效或过期，清除登录状态
    localStorage.removeItem(TOKEN_KEY);

    // 根据后端返回的message显示具体错误
    const backendMessage = errorData?.message || '';
    if (backendMessage.includes('禁用')) {
      showErrorMessage('账户已被禁用，请联系管理员');
    } else {
      showErrorMessage('登录已过期，请重新登录');
    }

    // 立即跳转登录页，不用 setTimeout 延迟
    // 之前用 setTimeout(500ms) 会导致页面在此期间渲染为空权限状态
    window.location.href = '/login';
  } else if (status === 403) {
    // 无权限访问
    showErrorMessage(errorData?.message || '您没有权限访问此资源');
  }
}

function normalizeNetworkError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error('请求超时，请稍后重试');
  }

  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    return new Error('网络连接失败，请确认前端代理和后端服务是否正常');
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('网络请求失败，请稍后重试');
}

/**
 * 发送请求
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, params, skipErrorHandler = false, skipParamsSnakeCase = false } = options;

  // 处理查询参数：GET 请求自动将 camelCase 参数名转为 snake_case
  // skipParamsSnakeCase=true 时跳过转换，保留原始参数名（适用于 ERP 参考数据 API）
  let fullUrl = `${API_BASE}${url}`;
  if (params && method === 'GET') {
    const processedParams = skipParamsSnakeCase ? params : toSnakeKeys(params);
    // 过滤掉 undefined 和 null 值
    const filteredParams = Object.entries(processedParams)
      .filter(([_, value]) => value !== undefined && value !== null && value !== '')
      .reduce((acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>);
    
    const queryString = new URLSearchParams(filteredParams).toString();
    if (queryString) {
      fullUrl += `?${queryString}`;
    }
  }

  // 获取 token 并添加到请求头
  const token = localStorage.getItem(TOKEN_KEY);
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  // 外部 signal 关联：当外部 abort 时也取消当前请求
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...headers,
    },
    signal: controller.signal,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(fullUrl, config);
  } catch (error) {
    clearTimeout(timeoutId);
    throw normalizeNetworkError(error);
  } finally {
    clearTimeout(timeoutId);
  }

  // 处理 HTTP 错误状态
  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // 无法解析响应体
    }

    // 处理认证相关错误
    if ((response.status === 401 || response.status === 403) && !skipErrorHandler) {
      handleAuthError(response.status, errorData);
    }

    const error = new Error(errorData?.message || `请求失败: ${response.status} ${response.statusText}`);
    (error as any).status = response.status;
    throw error;
  }

  const result = await response.json();

  // 处理标准响应格式
  // 格式1: { success: true, data: {...} }
  // 格式2: { code: 200, message: 'success', data: {...} }
  if (result && typeof result === 'object') {
    // 格式1: success + data 格式
    if ('success' in result && 'data' in result) {
      const { success, message: respMessage, data, ...rest } = result;
      // 分页格式: { success, data: [...], total, page, pageSize }
      if ('total' in rest) {
        return { data, ...rest } as T;
      }
      return data as T;
    }
    // 格式2: code + data 格式
    if ('code' in result && 'data' in result) {
      const { code, message: respMessage, data, ...rest } = result;
      // code 为 200 时正常返回 data
      if (code === 200) {
        // 分页格式: { code, message, data: [...], total, page, pageSize }
        if ('total' in rest) {
          return { data, ...rest } as T;
        }
        return data as T;
      }
      // code 非 200 时视为错误
      throw new Error(respMessage || `请求失败: code ${code}`);
    }
  }

  return result;
}

// 添加便捷方法
request.get = <T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> => {
  return request<T>(url, { ...options, method: 'GET' });
};

request.post = <T>(url: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> => {
  return request<T>(url, { ...options, method: 'POST', body });
};

request.put = <T>(url: string, body?: any, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> => {
  return request<T>(url, { ...options, method: 'PUT', body });
};

request.delete = <T>(url: string, options?: Omit<RequestOptions, 'method'>): Promise<T> => {
  return request<T>(url, { ...options, method: 'DELETE' });
};

/**
 * 发送 FormData 请求（用于文件上传）
 * 不设置 Content-Type，让浏览器自动设置 boundary
 */
export async function requestFormData<T = any>(
  url: string,
  formData: FormData,
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const normalizedError = normalizeNetworkError(error);
    if (normalizedError.message === '请求超时，请稍后重试') {
      throw new Error('上传超时，请稍后重试');
    }
    throw normalizedError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('未授权');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '上传失败');
  }

  return response.json();
}

export default request;
