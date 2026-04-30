/**
 * 统一考核管理 - 计算引擎入口
 * 遍历匹配的规则，逐规则执行 calculate()，收集结果并批量 upsert
 */

import { getMatchingRules } from './assessment.rules';
import * as repository from './assessment.repository';
import type { CalculationContext } from './assessment.types';

/**
 * 执行考核计算
 * @param ctx 计算上下文（包含触发方式、分类、规则类型等过滤条件）
 * @returns 本次计算的总记录数和成功写入数
 */
export async function runCalculation(
  ctx: CalculationContext
): Promise<{ totalRecords: number; newRecords: number }> {
  const matchingRules = getMatchingRules(ctx);

  if (matchingRules.length === 0) {
    console.log(`[Assessment] 无匹配规则, context: ${JSON.stringify(ctx)}`);
    return { totalRecords: 0, newRecords: 0 };
  }

  let totalRecords = 0;
  let newRecords = 0;

  for (const rule of matchingRules) {
    try {
      console.log(`[Assessment] 执行规则: ${rule.category}:${rule.ruleType} (${rule.name})`);
      const results = await rule.calculate(ctx);

      if (results.length > 0) {
        const count = await repository.batchUpsertRecords(results);
        totalRecords += results.length;
        newRecords += count;
        console.log(`[Assessment] 规则 ${rule.ruleType}: 计算 ${results.length} 条, 写入 ${count} 条`);
      }
    } catch (error) {
      // 单条规则失败不影响其他规则执行
      console.error(`[Assessment] 规则 ${rule.category}:${rule.ruleType} 执行失败:`, error);
    }
  }

  return { totalRecords, newRecords };
}
