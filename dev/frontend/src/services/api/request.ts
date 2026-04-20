/**
 * API 请求封装
 * 包含 401/403 响应处理
 */
import { message } from 'antd';
import { history } from 'umi';

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
}

/**
 * 处理认证错误
 */
function handleAuthError(status: number, errorData?: any): void {
  if (status === 401) {
    // Token 无效或过期，清除登录状态
    localStorage.removeItem(TOKEN_KEY);
    message.error('登录已过期，请重新登录');
    // 跳转到登录页
    setTimeout(() => {
      history.push('/login');
    }, 500);
  } else if (status === 403) {
    // 无权限访问
    message.error(errorData?.message || '您没有权限访问此资源');
  }
}

/**
 * 发送请求
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, params, skipErrorHandler = false } = options;

  // 处理查询参数
  let fullUrl = `${API_BASE}${url}`;
  if (params && method === 'GET') {
    // 过滤掉 undefined 和 null 值
    const filteredParams = Object.entries(params)
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
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
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

    throw new Error(errorData?.message || `请求失败: ${response.status} ${response.statusText}`);
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
      const { code, message: respMessage, data } = result;
      // code 为 200 时正常返回 data
      if (code === 200) {
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
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('上传超时，请稍后重试');
    }
    throw error;
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
