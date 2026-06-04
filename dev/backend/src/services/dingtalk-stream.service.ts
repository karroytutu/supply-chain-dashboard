/**
 * 钉钉 Stream 事件总线服务（项目级基础设施）
 *
 * 职责：
 * - 管理 DWClient WebSocket 长连接（启动/停止/自动重连）
 * - 接收所有钉钉事件，通过 EventEmitter 分发给各业务模块
 *
 * 使用方式：
 *   import { dingtalkEvents } from './dingtalk-stream.service';
 *   dingtalkEvents.on('user_leave_org', (data) => { ... });
 *
 * 不包含任何业务逻辑，仅负责连接管理和事件分发。
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Service');

import { EventEmitter } from 'events';
import {
  DWClient,
  EventAck,
  type DWClientDownStream,
  type EventAckData,
} from 'dingtalk-stream-sdk-nodejs';
import { config } from '../config';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * 钉钉事件总线
 * 各模块通过 dingtalkEvents.on(eventType, handler) 注册处理器
 */
export const dingtalkEvents = new EventEmitter();

// 允许较多监听器（多个模块注册不同事件）
dingtalkEvents.setMaxListeners(50);

let streamClient: DWClient | null = null;

/** 进程正在关闭，禁止重连 */
let isShuttingDown = false;

/** 最大重连次数（初始连接失败时） */
const MAX_CONNECT_RETRIES = 5;
/** 重连基础延迟（指数退避：3s, 6s, 12s, 24s, 48s） */
const CONNECT_RETRY_BASE_DELAY = 3000;

/**
 * 启动钉钉 Stream 连接
 * 建立 WebSocket 长连接，接收钉钉服务器推送的事件
 */
export function startDingtalkStream(): void {
  if (streamClient) {
    log.info('已有连接实例，跳过重复启动');
    return;
  }

  const clientId = config.dingtalk.appKey;
  const clientSecret = config.dingtalk.appSecret;

  if (!clientId || !clientSecret) {
    log.warn('未配置 appKey/appSecret，跳过 Stream 连接');
    return;
  }

  streamClient = new DWClient({
    clientId,
    clientSecret,
  });

  // 注册全局事件监听：接收所有钉钉事件，分发到 EventEmitter
  streamClient.registerAllEventListener((msg: DWClientDownStream): EventAckData => {
    const eventType = msg.headers.topic || msg.headers.eventType || '';

    try {
      const data = JSON.parse(msg.data || '{}');
      log.info(`收到事件: ${eventType}, eventId=${msg.headers.eventId}`);

      // 分发到事件总线，各模块自行处理
      dingtalkEvents.emit(eventType, data, msg.headers);

      // 同时分发通配事件，方便全局监听/日志
      dingtalkEvents.emit('*', eventType, data, msg.headers);

      return { status: EventAck.SUCCESS };
    } catch (error) {
      log.error(`解析事件 ${eventType} 失败:`, getErrorMessage(error));
      return { status: EventAck.LATER, message: getErrorMessage(error) };
    }
  });

  // 建立 WebSocket 连接
  streamClient
    .connect()
    .then(() => {
      log.info('✅ 事件总线已启动，WebSocket 连接已建立');
    })
    .catch((err: any) => {
      log.error('❌ WebSocket 连接失败:', getErrorMessage(err));
      streamClient = null;
      scheduleReconnect(1);
    });
}

/**
 * 计划重连（指数退避）
 * 仅在初始连接失败时调用；WebSocket 建立后的断线由 SDK 内部自动重连处理
 */
function scheduleReconnect(attempt: number): void {
  if (isShuttingDown) {
    log.info('进程正在关闭，取消重连');
    return;
  }
  if (attempt > MAX_CONNECT_RETRIES) {
    log.error(`已达最大重试次数(${MAX_CONNECT_RETRIES})，放弃重连。离职检测将依赖定期同步`);
    return;
  }
  const delay = CONNECT_RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
  log.info(`${delay / 1000}s 后进行第${attempt}次重连...`);
  setTimeout(() => {
    if (isShuttingDown) return;
    streamClient = null; // 确保 guard 不阻止重建
    startDingtalkStream();
  }, delay);
}

/**
 * 停止 Stream 连接
 * 设置 isShuttingDown 标志，阻止后续自动重连
 */
export function stopDingtalkStream(): void {
  isShuttingDown = true;
  if (streamClient) {
    streamClient.disconnect();
    streamClient = null;
    log.info('事件总线已停止');
  }
}
