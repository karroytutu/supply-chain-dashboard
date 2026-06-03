/**
 * OA 表单 nameField 名称解析工具
 * 解决历史数据中 nameField 命名不一致（如 customerName vs _customerName）的问题
 */

/**
 * 从数据对象中查找 nameField 对应的名称，兼容带/不带 _ 前缀的变体
 * 仅对 string/number 类型进行匹配，避免对象被 String() 转为 "[object Object]"
 *
 * @param nameField - 字段标识（可能带或不带 _ 前缀）
 * @param data - 数据源（formData / table row）
 * @returns 解析到的名称字符串，或 null
 */
export const resolveStoredName = (
  nameField: string | undefined,
  data?: Record<string, unknown>,
): string | null => {
  if (!nameField || !data) return null;
  const variants = [nameField];
  if (nameField.startsWith('_')) {
    variants.push(nameField.slice(1));
  } else {
    variants.push(`_${nameField}`);
  }
  for (const key of variants) {
    const val = data[key];
    if (val != null && (typeof val === 'string' || typeof val === 'number')) {
      const s = String(val).trim();
      if (s) return s;
    }
  }
  return null;
};
