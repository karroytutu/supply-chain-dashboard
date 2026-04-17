/**
 * 钉钉环境检测工具函数
 */

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
