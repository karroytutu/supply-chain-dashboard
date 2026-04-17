/**
 * 钉钉 SDK 加载和 dd.ready 管理
 */

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
export function waitDingtalkReady(): Promise<void> {
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
