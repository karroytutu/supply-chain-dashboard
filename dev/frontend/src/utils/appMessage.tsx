import { useEffect } from 'react';
import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { createLogger } from '../utils/logger';
const log = createLogger('AppMessage');


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

  log.error(content);
}

export function showLoadingMessage(content: string, duration?: number): void {
  const api = getMessageApi();
  if (api) {
    api.loading(content, duration);
    return;
  }

  log.info(content);
}
