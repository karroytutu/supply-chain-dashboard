/**
 * 工作台数据类型定义
 */

export interface WorkspaceItem {
  label: string;
  count: number;
  level: 'urgent' | 'warning' | 'normal';
}

export interface WorkspaceModule {
  code: string;
  name: string;
  icon: string;
  totalPending: number;
  items: WorkspaceItem[];
}

export interface WorkspaceSummary {
  totalPending: number;
  urgentCount: number;
  todayNew: number;
  todayDone: number;
}

export interface WorkspaceData {
  summary: WorkspaceSummary;
  modules: WorkspaceModule[];
}
