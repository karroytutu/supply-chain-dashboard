import { useEffect, useState } from 'react';
import { history } from 'umi';
import { Spin, Result, Button } from 'antd';
import { checkDingtalkEnv, dingtalkAutoLogin, dingtalkCallback, getCurrentUser, devLogin } from '@/services/api/auth';
import { getAuthCode, isInDingtalk, getClientType } from '@/utils/dingtalk';
import DingtalkQrcode from './components/DingtalkQrcode';
import styles from './index.less';

const TOKEN_KEY = 'auth_token';

// 检测是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [envInfo, setEnvInfo] = useState<{ isInDingtalk: boolean; clientType: 'pc' | 'mobile' | 'outside'; corpId: string; agentId: string }>({
    isInDingtalk: false,
    clientType: 'outside',
    corpId: '',
    agentId: '',
  });
  const [error, setError] = useState<string | null>(null);

  // 处理登录成功
  const handleLoginSuccess = (token: string, user: any) => {
    console.log('[Login] 登录成功，准备跳转', { token: token?.substring(0, 20) + '...', user });
    localStorage.setItem(TOKEN_KEY, token);
    const redirect = (history.location as any).query?.redirect || '/';
    console.log('[Login] 跳转目标:', redirect);
    // 使用 window.location.href 强制页面重新加载，确保 auth wrapper 正确初始化
    window.location.href = redirect;
  };

  // 钉钉免登
  const handleAutoLogin = async (corpId: string, agentId?: string) => {
    try {
      setLoading(true);
      const authCode = await getAuthCode(envInfo.clientType === 'outside' ? 'pc' : envInfo.clientType, corpId, agentId);
      const result = await dingtalkAutoLogin(authCode);
      
      if (result.success && result.token) {
        handleLoginSuccess(result.token, result.user);
      } else {
        setError(result.message || '登录失败');
      }
    } catch (err: any) {
      setError(err.message || '免登失败');
    } finally {
      setLoading(false);
    }
  };

  // 扫码登录回调
  const handleQrcodeCallback = async (authCode: string) => {
    console.log('[Login] 开始处理扫码回调，authCode:', authCode?.substring(0, 10) + '...');
    try {
      setLoading(true);
      const result = await dingtalkCallback(authCode);
      console.log('[Login] 扫码登录结果:', result);
      
      if (result.success && result.token) {
        handleLoginSuccess(result.token, result.user);
      } else {
        setError(result.message || '登录失败');
      }
    } catch (err: any) {
      console.error('[Login] 扫码登录异常:', err);
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 开发环境登录
  const handleDevLogin = async () => {
    try {
      setDevLoginLoading(true);
      const result = await devLogin();
      
      if (result.success && result.token) {
        handleLoginSuccess(result.token, result.user);
      } else {
        setError(result.message || '开发登录失败');
      }
    } catch (err: any) {
      setError(err.message || '开发登录失败');
    } finally {
      setDevLoginLoading(false);
    }
  };

  // 初始化：检测环境并自动登录
  useEffect(() => {
    const init = async () => {
      // 先检查本地是否已登录
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          await getCurrentUser();
          const redirect = (history.location as any).query?.redirect || '/';
          // 使用 window.location.href 强制页面重新加载
          window.location.href = redirect;
          return;
        } catch {
          localStorage.removeItem(TOKEN_KEY);
        }
      }

      // 检测钉钉环境
      let env;
      try {
        env = await checkDingtalkEnv();
      } catch {
        // 如果API检测失败，使用本地检测
        env = {
          isInDingtalk: isInDingtalk(),
          clientType: getClientType(),
          corpId: '',
          agentId: '',
        };
      }
      
      setEnvInfo(env);

      // 如果在钉钉环境，自动免登
      if (env.isInDingtalk && env.corpId) {
        handleAutoLogin(env.corpId, env.agentId);
      } else {
        setLoading(false);
      }
    };

    init();
  }, []);

  // 处理扫码登录回调
  useEffect(() => {
    const query = (history.location as any).query;
    const authCode = query?.authCode || query?.code;
    
    if (authCode) {
      handleQrcodeCallback(authCode);
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" tip="正在登录..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loadingContainer}>
        <Result
          status="error"
          title="登录失败"
          subTitle={error}
          extra={
            <a onClick={() => {
              setError(null);
              setLoading(true);
              if (envInfo.isInDingtalk && envInfo.corpId) {
                handleAutoLogin(envInfo.corpId, envInfo.agentId);
              } else {
                window.location.reload();
              }
            }}>
              重试
            </a>
          }
        />
      </div>
    );
  }

  // 外部浏览器显示扫码登录
  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <h1 className={styles.title}>鑫链云快消品供应链数据管理系统</h1>
        <p className={styles.subtitle}>请使用钉钉扫码登录</p>
        <DingtalkQrcode onCallback={handleQrcodeCallback} />
        {/* 开发环境登录按钮 */}
        {isDev && (
          <div className={styles.devLoginSection}>
            <Button
              type="primary"
              onClick={handleDevLogin}
              loading={devLoginLoading}
              style={{ width: '100%' }}
            >
              开发管理员登录
            </Button>
            <p className={styles.devHint}>（仅开发环境可见）</p>
          </div>
        )}
      </div>
    </div>
  );
}
