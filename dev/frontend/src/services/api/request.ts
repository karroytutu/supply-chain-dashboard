/**
 * API 请求封装
 */

const API_BASE = '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
}

/**
 * 发送请求
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, params } = options;

  // 处理查询参数
  let fullUrl = `${API_BASE}${url}`;
  if (params && method === 'GET') {
    const queryString = new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>)
    ).toString();
    if (queryString) {
      fullUrl += `?${queryString}`;
    }
  }

  // 获取 token 并添加到请求头
  const token = localStorage.getItem('auth_token');
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

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  
  // 如果响应包含 success 和 data 字段，说明是标准响应格式，返回 data 部分
  if (result && typeof result === 'object' && 'success' in result && 'data' in result) {
    // 保留其他字段如 total, page, pageSize 等
    const { success, message, ...dataPart } = result;
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
