import { useEffect } from 'react';
import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

let messageApi: MessageInstance | null = null;

function getMessageApi(): MessageInstance | null {
  return messageApi;
}

export function AppMessageBridge(): null {
  const { message } = App.useApp();

  useEffect(() => {
    messageApi = message;

    return () => {
      if (messageApi === message) {
        messageApi = null;
      }
    };
  }, [message]);

  return null;
}

export function showErrorMessage(content: string): void {
  const api = getMessageApi();
  if (api) {
    api.error(content);
    return;
  }

  console.error('[AppMessage]', content);
}

export function showLoadingMessage(content: string, duration?: number): void {
  const api = getMessageApi();
  if (api) {
    api.loading(content, duration);
    return;
  }

  console.info('[AppMessage]', content);
}
