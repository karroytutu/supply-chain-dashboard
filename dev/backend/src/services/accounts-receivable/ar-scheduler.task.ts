/**
 * 应收账款定时任务
 * 包含ERP同步后的数据处理和每日20:00推送
 */

import { runDailyNotificationTask } from './ar-notification.service';

export { runDailyNotificationTask };
