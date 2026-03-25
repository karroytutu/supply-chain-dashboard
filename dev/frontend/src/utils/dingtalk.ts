// 钉钉SDK加载和免登工具

const DINGTALK_SDK_URL = 'https://g.alicdn.com/dingding/dingtalk-jsapi/2.10.3/dingtalk.open.js';

let sdkLoaded = false;
let sdkLoading: Promise<void> | null = null;

declare global {
  interface Window {
    dd: any;
  }
}

/**
 * 加载钉钉SDK
 */
export function loadDingtalkSDK(): Promise<void> {
  if (sdkLoaded) {
    return Promise.resolve();
  }

  if (sdkLoading) {
    return sdkLoading;
  }

  sdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = DINGTALK_SDK_URL;
    script.async = true;
    
    script.onload = () => {
      sdkLoaded = true;
      resolve();
    };
    
    script.onerror = () => {
      sdkLoading = null;
      reject(new Error('钉钉SDK加载失败'));
    };
    
    document.head.appendChild(script);
  });

  return sdkLoading;
}

/**
 * 等待 dd.ready 回调
 */
function waitDingtalkReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.dd) {
      reject(new Error('钉钉SDK未加载'));
      return;
    }
    
    // 如果 dd 已经准备好，直接返回
    if ((window.dd as any)._ready) {
      resolve();
      return;
    }
    
    // 设置超时，避免无限等待
    const timeout = setTimeout(() => {
      reject(new Error('等待钉钉SDK准备超时'));
    }, 10000);
    
    window.dd.ready(() => {
      clearTimeout(timeout);
      (window.dd as any)._ready = true;
      resolve();
    });
    
    window.dd.error((error: any) => {
      clearTimeout(timeout);
      console.error('[Dingtalk] dd.error:', error);
      reject(new Error('钉钉SDK初始化失败'));
    });
  });
}

/**
 * 获取免登授权码（PC端）
 */
export async function getAuthCodePC(corpId: string): Promise<string> {
  await loadDingtalkSDK();
  
  console.log('[Dingtalk] PC免登调用, corpId:', corpId);
  console.log('[Dingtalk] dd对象是否存在:', !!window.dd);
  console.log('[Dingtalk] dd.runtime是否存在:', !!window.dd?.runtime);
  console.log('[Dingtalk] dd.runtime.permission是否存在:', !!window.dd?.runtime?.permission);
  
  // 等待 dd.ready
  try {
    await waitDingtalkReady();
    console.log('[Dingtalk] dd.ready 完成');
  } catch (err) {
    console.warn('[Dingtalk] dd.ready 等待失败，尝试直接调用:', err);
  }
  
  return new Promise((resolve, reject) => {
    if (!window.dd?.runtime?.permission?.requestAuthCode) {
      reject(new Error('钉钉SDK未正确加载或不在钉钉环境'));
      return;
    }
    
    window.dd.runtime.permission.requestAuthCode({
      corpId,
      onSuccess: (result: { code: string }) => {
        console.log('[Dingtalk] 获取授权码成功:', result.code?.substring(0, 10) + '...');
        resolve(result.code);
      },
      onFail: (error: any) => {
        console.error('[Dingtalk] 获取授权码失败:', JSON.stringify(error));
        reject(new Error(error.errorMessage || error.message || '获取授权码失败'));
      },
    });
  });
}

/**
 * 获取免登授权码（移动端）
 */
export async function getAuthCodeMobile(corpId: string, agentId?: string): Promise<string> {
  await loadDingtalkSDK();
  
  console.log('[Dingtalk] 移动端免登调用, corpId:', corpId, 'agentId:', agentId);
  console.log('[Dingtalk] dd对象是否存在:', !!window.dd);
  console.log('[Dingtalk] dd.runtime是否存在:', !!window.dd?.runtime);
  console.log('[Dingtalk] dd.runtime.permission是否存在:', !!window.dd?.runtime?.permission);
  
  // 等待 dd.ready
  try {
    await waitDingtalkReady();
    console.log('[Dingtalk] dd.ready 完成');
  } catch (err) {
    console.warn('[Dingtalk] dd.ready 等待失败，尝试直接调用:', err);
  }
  
  return new Promise((resolve, reject) => {
    if (!window.dd?.runtime?.permission?.requestAuthCode) {
      reject(new Error('钉钉SDK未正确加载或不在钉钉环境'));
      return;
    }
    
    const params: any = { corpId };
    // 移动端需要传入 agentId
    if (agentId) {
      params.agentId = agentId;
    }
    
    window.dd.runtime.permission.requestAuthCode({
      ...params,
      onSuccess: (result: { code: string }) => {
        console.log('[Dingtalk] 获取授权码成功:', result.code?.substring(0, 10) + '...');
        resolve(result.code);
      },
      onFail: (error: any) => {
        console.error('[Dingtalk] 获取授权码失败:', JSON.stringify(error));
        reject(new Error(error.errorMessage || error.message || '获取授权码失败'));
      },
    });
  });
}

/**
 * 获取免登授权码（自动判断环境）
 */
export async function getAuthCode(clientType: 'pc' | 'mobile', corpId: string, agentId?: string): Promise<string> {
  if (clientType === 'pc') {
    return getAuthCodePC(corpId);
  } else {
    return getAuthCodeMobile(corpId, agentId);
  }
}

/**
 * 检测是否在钉钉环境
 */
export function isInDingtalk(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('dingtalk');
}

/**
 * 检测客户端类型
 */
export function getClientType(): 'pc' | 'mobile' | 'outside' {
  if (!isInDingtalk()) {
    return 'outside';
  }
  
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'mobile';
  }
  
  return 'pc';
}
