/**
 * 表单字段比较工具函数
 * 从 FormFieldsDiff.tsx 提取的纯函数
 */

/** 检查 formData 是否包含变更对比原始值 */
export function hasOriginalFields(formData: Record<string, unknown>): boolean {
  return Object.keys(formData).some(k => k.startsWith('_original_'));
}

/** 比较两个值是否相等（null/undefined/'' 视为等价） */
export function valuesEqual(a: unknown, b: unknown): boolean {
  const normalize = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '';
    return String(v);
  };
  return normalize(a) === normalize(b);
}

/** photo 类型：提取照片 URL 用于比较 */
export function extractPhotoUrl(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) {
    const first = v.find(p => (p as { url?: string })?.url);
    return first ? ((first as { url?: string }).url ?? '') : '';
  }
  return '';
}
