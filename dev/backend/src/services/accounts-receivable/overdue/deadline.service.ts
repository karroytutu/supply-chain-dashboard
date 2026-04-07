/**
 * 时限配置服务
 * 负责流程节点时限配置的管理和计算
 */

import { appQuery } from '../../../db/appPool';
import type {
  ArDeadlineConfig,
  OverdueLevel,
  FlowNodeType,
  DeadlineConfigUpdateParams,
} from '../ar.types';

/** 时限配置缓存 */
let deadlineConfigCache: ArDeadlineConfig[] | null = null;
let cacheExpireTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * 获取时限配置列表
 * @returns 时限配置列表
 */
export async function getDeadlineConfigs(): Promise<ArDeadlineConfig[]> {
  try {
    const sql = `
      SELECT
        id,
        node_type,
        overdue_level,
        deadline_hours,
        warning_hours,
        is_active,
        created_at,
        updated_at
      FROM ar_deadline_configs
      WHERE is_active = true
      ORDER BY node_type, overdue_level
    `;

    const result = await appQuery<ArDeadlineConfig>(sql);
    return result.rows;
  } catch (error) {
    console.error('[DeadlineService] 获取时限配置失败:', error);
    throw new Error('获取时限配置失败');
  }
}

/**
 * 获取时限配置（带缓存）
 * @returns 时限配置列表
 */
async function getDeadlineConfigsWithCache(): Promise<ArDeadlineConfig[]> {
  const now = Date.now();

  if (deadlineConfigCache && now < cacheExpireTime) {
    return deadlineConfigCache;
  }

  deadlineConfigCache = await getDeadlineConfigs();
  cacheExpireTime = now + CACHE_TTL;

  return deadlineConfigCache!;
}

/**
 * 清除时限配置缓存
 */
export function clearDeadlineConfigCache(): void {
  deadlineConfigCache = null;
  cacheExpireTime = 0;
}

/**
 * 更新时限配置
 * @param id 配置ID
 * @param params 更新参数
 * @returns 更新后的配置
 */
export async function updateDeadlineConfig(
  id: number,
  params: DeadlineConfigUpdateParams
): Promise<ArDeadlineConfig> {
  try {
    const updates: string[] = [];
    const values: (number | boolean)[] = [];
    let paramIndex = 1;

    if (params.deadlineHours !== undefined) {
      updates.push(`deadline_hours = $${paramIndex++}`);
      values.push(params.deadlineHours);
    }

    if (params.warningHours !== undefined) {
      updates.push(`warning_hours = $${paramIndex++}`);
      values.push(params.warningHours);
    }

    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }

    if (updates.length === 0) {
      throw new Error('无更新内容');
    }

    values.push(id);
    const sql = `
      UPDATE ar_deadline_configs
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING
        id,
        node_type,
        overdue_level,
        deadline_hours,
        warning_hours,
        is_active,
        created_at,
        updated_at
    `;

    const result = await appQuery<ArDeadlineConfig>(sql, values);

    if (result.rows.length === 0) {
      throw new Error('配置不存在');
    }

    // 清除缓存
    clearDeadlineConfigCache();

    console.log(`[DeadlineService] 已更新时限配置 id=${id}`);

    return result.rows[0];
  } catch (error) {
    console.error('[DeadlineService] 更新时限配置失败:', error);
    throw error;
  }
}

/**
 * 获取节点时限小时数
 * @param nodeType 节点类型
 * @param overdueLevel 逾期等级
 * @returns 时限小时数
 */
export async function getDeadlineHours(
  nodeType: FlowNodeType,
  overdueLevel: OverdueLevel
): Promise<number> {
  try {
    const configs = await getDeadlineConfigsWithCache();

    const config = configs.find(
      (c) => c.node_type === nodeType && c.overdue_level === overdueLevel
    );

    if (!config) {
      // 返回默认值
      console.warn(
        `[DeadlineService] 未找到时限配置: nodeType=${nodeType}, overdueLevel=${overdueLevel}，使用默认值`
      );
      return getDefaultDeadlineHours(nodeType, overdueLevel);
    }

    return config.deadline_hours;
  } catch (error) {
    console.error('[DeadlineService] 获取时限小时数失败:', error);
    throw new Error('获取时限小时数失败');
  }
}

/**
 * 获取默认时限小时数
 * @param nodeType 节点类型
 * @param overdueLevel 逾期等级
 * @returns 默认时限小时数
 */
function getDefaultDeadlineHours(nodeType: FlowNodeType, overdueLevel: OverdueLevel): number {
  const defaults: Record<FlowNodeType, Record<OverdueLevel, number>> = {
    preprocessing: { light: 24, medium: 16, severe: 8 },
    assignment: { light: 8, medium: 4, severe: 2 },
    collection: { light: 72, medium: 48, severe: 24 },
    review: { light: 24, medium: 24, severe: 24 },
  };

  return defaults[nodeType]?.[overdueLevel] || 24;
}

/**
 * 计算节点截止时间
 * @param nodeType 节点类型
 * @param overdueLevel 逾期等级
 * @param startTime 开始时间
 * @returns 截止时间
 */
export async function calculateNodeDeadline(
  nodeType: FlowNodeType,
  overdueLevel: OverdueLevel,
  startTime: Date
): Promise<Date> {
  try {
    const hours = await getDeadlineHours(nodeType, overdueLevel);

    const deadline = new Date(startTime);
    deadline.setTime(deadline.getTime() + hours * 60 * 60 * 1000);

    return deadline;
  } catch (error) {
    console.error('[DeadlineService] 计算节点截止时间失败:', error);
    throw new Error('计算节点截止时间失败');
  }
}

/**
 * 批量计算节点截止时间
 * @param nodeTypes 节点类型列表
 * @param overdueLevel 逾期等级
 * @param startTime 开始时间
 * @returns 节点类型到截止时间的映射
 */
export async function calculateBatchNodeDeadlines(
  nodeTypes: FlowNodeType[],
  overdueLevel: OverdueLevel,
  startTime: Date
): Promise<Map<FlowNodeType, Date>> {
  const result = new Map<FlowNodeType, Date>();

  try {
    const configs = await getDeadlineConfigsWithCache();

    nodeTypes.forEach((nodeType) => {
      const config = configs.find(
        (c) => c.node_type === nodeType && c.overdue_level === overdueLevel
      );

      const hours = config?.deadline_hours || getDefaultDeadlineHours(nodeType, overdueLevel);
      const deadline = new Date(startTime);
      deadline.setTime(deadline.getTime() + hours * 60 * 60 * 1000);

      result.set(nodeType, deadline);
    });

    return result;
  } catch (error) {
    console.error('[DeadlineService] 批量计算节点截止时间失败:', error);
    throw new Error('批量计算节点截止时间失败');
  }
}

/**
 * 获取预警时间（截止前多久开始预警）
 * @param nodeType 节点类型
 * @param overdueLevel 逾期等级
 * @returns 预警小时数
 */
export async function getWarningHours(
  nodeType: FlowNodeType,
  overdueLevel: OverdueLevel
): Promise<number> {
  try {
    const configs = await getDeadlineConfigsWithCache();

    const config = configs.find(
      (c) => c.node_type === nodeType && c.overdue_level === overdueLevel
    );

    return config?.warning_hours || 4;
  } catch (error) {
    console.error('[DeadlineService] 获取预警时间失败:', error);
    return 4; // 默认 4 小时
  }
}
