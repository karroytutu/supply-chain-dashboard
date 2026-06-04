/**
 * 钉钉认证授权
 * 合并 PC 端和移动端免登逻辑
 */
import { loadDingtalkSDK, waitDingtalkReady } from './sdk';
import { createLogger } from '../../utils/logger';
const log = createLogger('Auth');

interface RequestAuthCodeParams {
  corpId: string;
  agentId?: string;
}

/**
 * 请求授权码的通用逻辑
 * PC 端和移动端共用，移动端额外支持 agentId 参数
 */
async function requestAuthCode(params: RequestAuthCodeParams): Promise<string> {
  await loadDingtalkSDK();

  const { corpId, agentId } = params;
  log.info('免登调用, corpId:', corpId, 'agentId:', agentId);
  log.info('dd对象是否存在:', !!window.dd);
  log.info('dd.runtime是否存在:', !!window.dd?.runtime);
  log.info('dd.runtime.permission是否存在:', !!window.dd?.runtime?.permission);

  // 等待 dd.ready
  try {
    await waitDingtalkReady();
    log.info('dd.ready 完成');
  } catch (err) {
    log.warn('dd.ready 等待失败，尝试直接调用:', err);
  }

  return new Promise((resolve, reject) => {
    if (!window.dd?.runtime?.permission?.requestAuthCode) {
      reject(new Error('钉钉SDK未正确加载或不在钉钉环境'));
      return;
    }

    const apiParams: any = { corpId };
    // 移动端需要传入 agentId
    if (agentId) {
      apiParams.agentId = agentId;
    }

    window.dd.runtime.permission.requestAuthCode({
      ...apiParams,
      onSuccess: (result: { code: string }) => {
        log.info('获取授权码成功:', result.code?.substring(0, 10) + '...');
        resolve(result.code);
      },
      onFail: (error: any) => {
        log.error('获取授权码失败:', JSON.stringify(error));
        reject(new Error(error.errorMessage || error.message || '获取授权码失败'));
      },
    });
  });
}

/**
 * 获取免登授权码（PC端）
 */
export async function getAuthCodePC(corpId: string): Promise<string> {
  return requestAuthCode({ corpId });
}

/**
 * 获取免登授权码（移动端）
 */
export async function getAuthCodeMobile(corpId: string, agentId?: string): Promise<string> {
  return requestAuthCode({ corpId, agentId });
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
