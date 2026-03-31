/**
 * API 请求封装
 * 包含 401/403 响应处理
 */
import { message } from 'antd';
import { history } from 'umi';

const API_BASE = '/api';
const TOKEN_KEY = 'auth_token';

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

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(fullUrl, config);

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
  
  // 如果响应包含 success 和 data 字段，说明是标准响应格式，返回 data 部分
  if (result && typeof result === 'object' && 'success' in result && 'data' in result) {
    // 保留其他字段如 total, page, pageSize 等
    const { success, message: respMessage, ...dataPart } = result;
    return dataPart as T;
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

export default request;
