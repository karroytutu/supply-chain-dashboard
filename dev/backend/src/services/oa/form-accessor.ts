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

  /**
   * 获取 table 字段的完整记录数组
   *
   * 优先从主字段读取（新格式：完整记录数组）。
   * 若主字段为历史 ID 数组（非对象元素），尝试从 _details 回退读取。
   * NOTE: _details fallback 为过渡期兼容，前端存储迁移完成后可移除。
   */
  getTableRecords(fieldKey: string): Record<string, unknown>[] {
    const value = this.data[fieldKey];
    // 主字段是对象数组 → 直接使用（新格式）
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      return value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null);
    }
    // 主字段非对象数组（历史 ID 数组）→ 尝试 _details fallback
    const details = this.data._details as Record<string, unknown> | undefined;
    const detailValue = details?.[fieldKey];
    if (Array.isArray(detailValue)) {
      return detailValue.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null);
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
