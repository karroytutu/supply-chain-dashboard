import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { getQrcodeConfig } from '@/services/api/auth';
import styles from '../index.less';

interface DingtalkQrcodeProps {
  onCallback: (authCode: string) => void;
}

// 消息类型常量
const DINGTALK_CALLBACK_TYPE = 'DINGTALK_CALLBACK';

export default function DingtalkQrcode({ onCallback }: DingtalkQrcodeProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<{ appId: string; redirectUri: string; state: string } | null>(null);

  // 监听来自iframe的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('[DingtalkQrcode] 收到消息:', event.data, '来源:', event.origin);
      
      // 安全验证：检查消息来源
      if (event.origin !== window.location.origin) {
        console.warn('收到来自非预期来源的消息:', event.origin);
        return;
      }

      // 验证消息类型
      if (event.data?.type === DINGTALK_CALLBACK_TYPE) {
        const { authCode } = event.data.payload || {};
        console.log('[DingtalkQrcode] 收到钉钉回调，authCode:', authCode?.substring(0, 10) + '...');
        if (authCode) {
          onCallback(authCode);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onCallback]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await getQrcodeConfig();
        setConfig(result);
      } catch (error) {
        console.error('获取扫码配置失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  if (loading) {
    return (
      <div className={styles.qrcodeContainer}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (!config) {
    return (
      <div className={styles.qrcodeContainer}>
        <p>加载失败，请刷新重试</p>
      </div>
    );
  }

  // 构建钉钉扫码登录URL
  const { appId, redirectUri, state } = config;
  const qrcodeUrl = `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&client_id=${appId}&scope=openid&state=${state}&prompt=consent`;

  return (
    <div className={styles.qrcodeContainer}>
      <iframe
        src={qrcodeUrl}
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}
