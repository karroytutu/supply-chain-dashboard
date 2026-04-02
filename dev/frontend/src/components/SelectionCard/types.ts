/**
 * SelectionCard 组件类型定义
 */

// 字段映射配置
export interface SelectionCardFieldConfig<T> {
  /** 唯一键字段名 */
  rowKey: keyof T;
  /** 标题字段名 */
  titleKey: keyof T;
  /** 描述字段名（可选） */
  descriptionKey?: keyof T;
  /** 编码字段名（可选） */
  codeKey?: keyof T;
  /** 标签条件字段名（可选，如 is_system） */
  tagKey?: keyof T;
  /** 标签显示文本 */
  tagLabel?: string;
  /** 禁用条件判断函数 */
  disabledKey?: (item: T) => boolean;
  /** 禁用时的 Tooltip 提示 */
  disabledTooltip?: string;
  /** 网格列数 */
  columns?: number;
  /** 选择模式：multiple 多选（默认），single 单选 */
  mode?: 'multiple' | 'single';
}

// 组件属性
export interface SelectionCardProps<T> {
  /** 数据源 */
  dataSource: T[];
  /** 选中的 key 列表 */
  selectedKeys: React.Key[];
  /** 选中变化回调 */
  onChange: (keys: React.Key[]) => void;
  /** 字段映射配置 */
  config: SelectionCardFieldConfig<T>;
}
