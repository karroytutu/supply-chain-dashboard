/**
 * OA 表单数据访问器
 *
 * 职责：为 OA 回调提供类型安全的 formData 读取能力，
 * 替代直接操作 Record<string, unknown> 的危险断言模式。
 *
 * 数据契约：
 * - table 类型字段：value = 完整记录数组（模式一）
 * - 标量字段：value = string | number | boolean | null
 */
export class FormAccessor {
  constructor(private readonly data: Record<string, unknown>) {}

  /** 未迁移字段告警去重：每个 fieldKey 只告警一次，防止日志泛滥 */
  private static warnedFields = new Set<string>();

  /**
   * 获取 table 字段的完整记录数组
   *
   * SSOT: 主字段即唯一数据源，从主字段读取完整记录数组。
   * 历史 ID 数组格式已通过迁移脚本转换为对象数组。
   */
  getTableRecords(fieldKey: string): Record<string, unknown>[] {
    const value = this.data[fieldKey];
    if (Array.isArray(value) && value.length > 0) {
      if (typeof value[0] === 'object' && value[0] !== null) {
        return value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null);
      }
      // 降级告警：主字段仍为 ID 数组（未迁移数据），返回空数组
      if (!FormAccessor.warnedFields.has(fieldKey)) {
        FormAccessor.warnedFields.add(fieldKey);
        console.warn(`[FormAccessor] getTableRecords('${fieldKey}'): 主字段为 ID 数组（未迁移），返回空数组。请确认迁移脚本已执行。`);
      }
    }
    return [];
  }

  /** 从 table 字段按 valueKey 提取 ID 字符串数组 */
  getTableIds(fieldKey: string, valueKey: string): string[] {
    const value = this.data[fieldKey];
    if (!Array.isArray(value)) return [];
    return value.map(item => {
      if (typeof item === 'object' && item !== null && valueKey in item) {
        return String((item as Record<string, unknown>)[valueKey]);
      }
      return String(item); // 兼容历史 ID 数组格式
    });
  }

  /** 从 table 字段按 valueKey 提取 ID Set */
  getTableIdSet(fieldKey: string, valueKey: string): Set<string> {
    return new Set(this.getTableIds(fieldKey, valueKey));
  }

  /** 读取字符串字段 */
  getString(key: string): string | undefined {
    const v = this.data[key];
    return v != null ? String(v) : undefined;
  }

  /** 读取数字字段 */
  getNumber(key: string): number | undefined {
    const v = this.data[key];
    if (v == null) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  }

  /** 读取布尔字段 */
  getBoolean(key: string): boolean | undefined {
    const v = this.data[key];
    if (v == null) return undefined;
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return undefined;
  }

  /** 读取任意字段值（不做类型转换） */
  getRaw(key: string): unknown {
    return this.data[key];
  }

  /** 读取底层 formData（仅用于需要透传原始数据的罕见场景） */
  getRawData(): Record<string, unknown> {
    return this.data;
  }
}

/** 从原始 formData 创建 FormAccessor */
export function createFormAccessor(
  formData: Record<string, unknown>
): FormAccessor {
  return new FormAccessor(formData);
}
