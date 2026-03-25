import { useEffect, useState } from 'react';
import { Spin, Result } from 'antd';
import styles from './index.less';

export default function LoginCallback() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = () => {
      // 从URL参数获取授权码
      const params = new URLSearchParams(window.location.search);
      const authCode = params.get('code') || params.get('authCode');
      const state = params.get('state');

      if (!authCode) {
        setStatus('error');
        setErrorMessage('未获取到授权码，请重新扫码');
        return;
      }

      // 检查是否在iframe中
      if (window.parent !== window) {
        // 在iframe中，通过postMessage发送给父窗口
        const message = {
          type: 'DINGTALK_CALLBACK',
          payload: {
            authCode,
            state,
          },
        };

        try {
          // 发送消息给父窗口
          window.parent.postMessage(message, window.location.origin);
        } catch (error) {
          console.error('发送消息失败:', error);
          setStatus('error');
          setErrorMessage('登录回调失败，请重试');
        }
      } else {
        // 不在iframe中（直接访问），显示错误
        setStatus('error');
        setErrorMessage('非法访问，请从登录页面进入');
      }
    };

    handleCallback();
  }, []);

  if (status === 'error') {
    return (
      <div className={styles.container}>
        <Result
          status="error"
          title="登录失败"
          subTitle={errorMessage}
          extra={
            <a href="/login">返回登录页面</a>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Spin size="large" tip="正在登录..." />
    </div>
  );
}
