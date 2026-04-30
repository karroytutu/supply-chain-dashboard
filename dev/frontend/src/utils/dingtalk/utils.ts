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

/**
 * 钉钉 WebView 视口高度修正
 * 钉钉 WebView 中 100vh 计算不准确（包含导航栏等），
 * 通过 JS 测量实际可见高度并设置 CSS 自定义属性 --vh，
 * 配合 CSS calc(var(--vh, 1vh) * 100) 实现精确布局。
 */
export function setDingtalkViewportHeight(): void {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

/**
 * 初始化钉钉视口高度监听
 * 在钉钉环境下持续修正 --vh 值（窗口缩放、旋转等场景）
 */
export function initDingtalkViewportHeight(): () => void {
  if (!isInDingtalk()) return () => {};

  setDingtalkViewportHeight();
  window.addEventListener('resize', setDingtalkViewportHeight);
  return () => window.removeEventListener('resize', setDingtalkViewportHeight);
}
