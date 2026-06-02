/**
 * 工作台 API 服务
 */

import request from './request';
import type { WorkspaceData } from '@/types/workspace';

/**
 * 获取工作台聚合数据
 */
export function getWorkspaceData(): Promise<WorkspaceData> {
  return request.get<WorkspaceData>('/workspace');
}
