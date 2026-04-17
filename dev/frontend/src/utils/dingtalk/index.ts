/**
 * 钉钉工具模块入口
 * 重新导出所有公开 API，保持外部 import 路径兼容
 */

export { loadDingtalkSDK, waitDingtalkReady } from './sdk';
export { getAuthCodePC, getAuthCodeMobile, getAuthCode } from './auth';
export { isInDingtalk, getClientType } from './utils';
