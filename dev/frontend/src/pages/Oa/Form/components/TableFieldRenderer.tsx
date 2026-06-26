/**
 * 表格类型字段渲染器
 * 统一支持可编辑模式（增删行、单元格输入）和只读模式（纯文本展示 + 汇总行）
 * 通过 readonly prop 切换模式，消除了原先 ReadonlyTable 的重复实现
 */
import React, { useCallback, useState } from 'react';
import { Button, Input, InputNumber, Select, DatePicker, Table, Popconfirm, Form, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FormField, FieldPermission } from '@/types/oa';
import { evaluateFormula } from '@/utils/formula-evaluator';
import { TABLE_ERP_TYPES, useContainerWidth, getColumnWidth, NUMERIC_ALIGN_TYPES } from '@/components/Oa/hooks/useContainerWidth';
import { useColumnWidths } from '@/components/Oa/hooks/useColumnWidths';
import { renderCellValue } from '@/components/Oa/cellValueRenderer';
import type { ErpResolvedMap } from '@/components/Oa/hooks/useErpFieldResolve';
import ErpFieldRenderer from './ErpFieldRenderer';
import { buildDynamicOptions } from '@/components/Oa/fields/SelectFieldControl';
import { checkCondition } from './ConditionalFieldWrapper';
import { allocateTableRows } from '../allocateTableRows';
import type { AllocateMethod } from '../allocateTableRows';
import styles from '../index.less';

interface TableFieldRendererProps {
  field: FormField;
  value?: Record<string, unknown>[];
  onChange?: (value: Record<string, unknown>[]) => void;
  /** 表格子字段权限（key为子字段key，如 feeLines.feeUnitPrice → feeUnitPrice） */
  subFieldPermissions?: Record<string, FieldPermission>;
  /** 只读模式：隐藏操作列和添加按钮，使用 cellValueRenderer 渲染纯文本 */
  readonly?: boolean;
  /** 只读模式下传入的 ERP 解析结果 */
  resolvedMap?: ErpResolvedMap;
  /** 父级表单数据，供子列 visibleWhen 条件引用 */
  formData?: Record<string, unknown>;
}

/** 重算行内公式字段，返回更新后的行数据
 *  @param fullContext 父级表单数据，使行内公式可引用其他表格（如 mainGoodsList、stepPresents）
 */
export function recalcRowFormulas(
  row: Record<string, unknown>,
  columns: FormField[],
  fullContext?: Record<string, unknown>,
): Record<string, unknown> {
  const formulaChildren = columns.filter(c => c.type === 'formula' && c.formula);
  if (formulaChildren.length === 0) return row;
  const updated = { ...row };
  // 合并完整上下文：父级数据 + 行数据覆盖（行字段优先级更高）
  const ctx = fullContext ? { ...fullContext, ...updated } : updated;
  for (const fc of formulaChildren) {
    const result = evaluateFormula(fc.formula!, ctx);
    const precision = fc.formulaPrecision ?? 2;
    updated[fc.key] = Number(result.toFixed(precision));
  }
  return updated;
}

/** 渲染单个单元格输入组件 */
const CellInput: React.FC<{
  childField: FormField;
  value: unknown;
  onChange: (val: unknown) => void;
  /** 同行数据，用于 ERP 级联和 nameField 写入 */
  rowData: Record<string, unknown>;
  /** 更新同行多个字段（nameField + autoFill 写入用） */
  onRowUpdate: (updates: Record<string, unknown>) => void;
  /** 表格是否处于只读模式 */
  disabled?: boolean;
  /** 单元格失焦回调（列宽动态计算） */
  onBlur?: () => void;
}> = ({ childField, value, onChange, rowData, onRowUpdate, disabled, onBlur }) => {
  // disabled 模式下渲染为只读文本
  if (disabled) {
    if (value == null || value === '') {
      return <span style={{ fontSize: 13, color: '#999' }}>-</span>;
    }
    // 金额字段：保留两位小数 + 千位分隔
    let displayValue: string;
    if (childField.type === 'money') {
      const num = Number(value);
      displayValue = !isNaN(num)
        ? num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(value);
    } else {
      displayValue = String(value);
    }
    // 附加单位后缀（如库存的“件”、可售天数的“天”）
    if (childField.suffix) {
      displayValue += childField.suffix;
    }
    return <span style={{ fontSize: 13 }}>{displayValue}</span>;
  }

  // ERP 字段类型：使用 ErpFieldRenderer
  if (TABLE_ERP_TYPES.has(childField.type)) {
    const cascadeValue = childField.cascadeFrom ? rowData[childField.cascadeFrom] : undefined;
    return (
      <ErpFieldRenderer
        field={childField}
        value={value}
        onChange={(v) => {
          // 选中值已通过 ErpFieldRenderer 的合并 setFieldsValue 写入（含 autoFill + nameField），
          // 不再单独调用 onChange 避免闭包竞态覆盖；仅清空时直接更新单元格值
          if (v === undefined || v === null) {
            onChange(v);
          }
          // Ant Design Select 选中后不会触发 onBlur（下拉关闭 ≠ 失焦），
          // 需主动触发列宽重算；延迟 100ms 确保 React 完成状态更新和 re-render
          setTimeout(() => onBlur?.(), 100);
        }}
        cascadeValue={cascadeValue}
        onBlur={onBlur}
        form={{
          setFieldsValue: (values) => {
            // nameField 写入 + autoFill 写入：更新到同行数据
            onRowUpdate(values);
          },
          getFieldValue: (name: string) => rowData[name],
        }}
      />
    );
  }

  switch (childField.type) {
    case 'number':
    case 'money':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={childField.placeholder || `请输入${childField.label}`}
          min={childField.min}
          max={childField.max}
          precision={childField.type === 'money' ? 2 : childField.precision}
          value={value as number | undefined}
          onChange={(v) => onChange(v)}
          onBlur={onBlur}
          size="small"
        />
      );
    case 'select': {
      let selectOptions = childField.options;
      // optionsFromField: 从同行数据的指定字段动态生成选项（如 _goodsUnits 数组）
      if (childField.optionsFromField) {
        const dynamicOpts = buildDynamicOptions(rowData[childField.optionsFromField]);
        if (dynamicOpts) selectOptions = dynamicOpts;
      }
      return (
        <Select
          style={{ width: '100%' }}
          placeholder={childField.placeholder || `请选择${childField.label}`}
          options={selectOptions}
          value={value as string | undefined}
          onChange={(v) => onChange(v)}
          onBlur={onBlur}
          size="small"
        />
      );
    }
    case 'date':
      return (
        <DatePicker
          style={{ width: '100%' }}
          placeholder={childField.placeholder || '请选择日期'}
          value={value ? dayjs(value as string) : undefined}
          onChange={(_, dateString) => onChange(dateString as string)}
          onOpenChange={(open) => { if (!open) onBlur?.(); }}
          size="small"
        />
      );
    case 'textarea':
      return (
        <Input.TextArea
          placeholder={childField.placeholder || `请输入${childField.label}`}
          value={value as string | undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoSize={{ minRows: 1 }}
          size="small"
        />
      );
    case 'formula':
      // 公式字段：只读展示，值由行内公式重算逻辑自动填充
      return (
        <InputNumber
          style={{ width: '100%' }}
          precision={childField.formulaPrecision ?? 2}
          value={value != null ? Number(value) : undefined}
          disabled
          size="small"
        />
      );
    case 'text':
    default:
      return (
        <Input
          placeholder={childField.placeholder || `请输入${childField.label}`}
          value={value as string | undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          size="small"
        />
      );
  }
};

const TableFieldRenderer: React.FC<TableFieldRendererProps> = ({ field, value = [], onChange, subFieldPermissions, readonly: isReadonly, resolvedMap, formData }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  const columns = field.children || [];
  // 过滤子字段：hidden 字段 + visibleWhen 条件不满足的列（支持引用父级表单字段）
  const visibleColumns = columns.filter(col => {
    if (col.hidden) return false;
    if (col.visibleWhen && formData && !checkCondition(col.visibleWhen, formData)) return false;
    return true;
  });
  const [containerRef, containerWidth] = useContainerWidth();
  const fixFirstCol = visibleColumns.length >= 4;
  const isDisabled = !!field.disabled;
  // 混合模式：表格非整体只读，但存在 disabled 子列（如物流费用明细表）
  // 此类表格的只读列应自适应内容宽度，与纯只读表格行为一致
  // 参考《只读表格列宽自适应与换行规范》《采购明细表格布局规范》
  const isReadonlyLike = isReadonly || isDisabled || visibleColumns.some(col => col.disabled);

  // 基于内容动态计算列宽（blur 触发重算 + CSS transition 平滑过渡）
  // 只读模式：使用纯文本 padding，跳过控件类型最小宽度
  const { widths: colWidths, recalcColumn } = useColumnWidths(
    visibleColumns,
    value,
    { readonly: isReadonlyLike },
  );

  // ==================== 分摊配置状态 ====================
  // 仅当 field.allocate 配置存在且表格非只读时，渲染分摊操作区（金额输入 + 方式下拉，选好自动触发）
  const [allocateAmount, setAllocateAmount] = useState<number | null>(null);
  const allocateConfig = field.allocate;
  const showAllocateBar = !isReadonly && !isDisabled && !!allocateConfig && (value?.length ?? 0) > 0;

  /** 分摊方式下拉的 onChange：选好方式后自动触发分摊（无需按钮） */
  const handleAllocate = useCallback((method: AllocateMethod) => {
    if (allocateAmount == null || allocateAmount <= 0) {
      message.warning('请先输入分摊总金额');
      return;
    }
    if (!allocateConfig) return;
    const { rows: newRows, error } = allocateTableRows(value, allocateAmount, method, allocateConfig);
    if (error) {
      message.warning(error);
      return;
    }
    onChange?.(newRows);
  }, [value, allocateAmount, allocateConfig, onChange]);

  /** 分摊方式下拉的选项（从配置中动态生成） */
  const allocateMethodOptions = allocateConfig?.methods.map((m) => ({
    value: m,
    label: m === 'by_amount' ? '按金额分摊' : '按数量分摊',
  })) || [];

  // ==================== 只读模式汇总行 ====================

  const formulaChildren = columns.filter(c => c.type === 'formula' && c.formula);
  const statFieldKeys = (field.statField || []).map(s => s.componentId);
  const summaryKeys = new Set([
    ...formulaChildren.map(c => c.key),
    ...statFieldKeys,
  ]);
  const hasSummary = isReadonly && summaryKeys.size > 0 && (value?.length ?? 0) > 0;

  const handleAdd = useCallback(() => {
    const newRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      newRow[col.key] = col.defaultValue ?? undefined;
    });
    // 初始化行内公式字段（对默认值求值）
    const rowWithFormulas = recalcRowFormulas(newRow, columns, formData);
    onChange?.([...value, rowWithFormulas]);
  }, [value, columns, onChange, formData]);

  const handleRemove = useCallback((index: number) => {
    const newValue = [...value];
    newValue.splice(index, 1);
    onChange?.(newValue);
  }, [value, onChange]);

  const handleCellChange = useCallback((rowIndex: number, key: string, cellValue: unknown) => {
    const newValue = [...value];
    const updatedRow = { ...newValue[rowIndex], [key]: cellValue };

    // 单位切换联动：当 currUnitName 变化时，从 _goodsUnits 查找选中单位的换算系数
    if (key === 'currUnitName') {
      const unitsArr = updatedRow._goodsUnits as Array<{ id: string; factor?: number }> | undefined;
      if (Array.isArray(unitsArr)) {
        const matched = unitsArr.find(u => u.id === cellValue);
        if (matched?.factor != null) {
          updatedRow._unitFactor = matched.factor;
        }
      }
      // 同步 currUnitId，使回调函数发给 ERP API 的单位与用户选择一致
      updatedRow.currUnitId = cellValue;
    }

    // syncFrom 自动同步：当源字段变更时，自动同步引用它的目标字段
    for (const col of columns) {
      if (col.syncFrom === key && updatedRow[col.key] !== cellValue) {
        updatedRow[col.key] = cellValue;
      }
    }

    // ── 临期阶梯定价：天数/售价递减校验 ──
    const nearExpiryMatch = key.match(/^nearExpiry(Days|Price)(\d+)$/);
    if (nearExpiryMatch) {
      const kind = nearExpiryMatch[1] as 'Days' | 'Price';

      // 收集各级已填写的值（按级别顺序）
      const filledLevels: { level: number; val: number }[] = [];
      for (let k = 1; k <= 3; k++) {
        const v = Number(updatedRow[`nearExpiry${kind}${k}`]);
        if (v > 0) filledLevels.push({ level: k, val: v });
      }

      // 检查递减约束：每个级别的值必须严格小于上一个已填写级别的值
      let violated = false;
      for (let j = 1; j < filledLevels.length; j++) {
        if (filledLevels[j].val >= filledLevels[j - 1].val) {
          const cur = filledLevels[j];
          const prev = filledLevels[j - 1];
          const kindLabel = kind === 'Days' ? '天数' : '售价';
          message.warning(`第${cur.level}级${kindLabel}不能 ≥ 第${prev.level}级（${cur.val} ≥ ${prev.val}），请输入更小的值`);
          updatedRow[key] = undefined;
          violated = true;
          break;
        }
      }

      // 临期售价自动填充：取最高价 → 促销价，取最低价 → 最低促销价
      if (kind === 'Price' && !violated) {
        const prices: number[] = [];
        for (let k = 1; k <= 3; k++) {
          const v = Number(updatedRow[`nearExpiryPrice${k}`]);
          if (v > 0) prices.push(v);
        }
        if (prices.length > 0) {
          updatedRow.onSalePrice = Math.max(...prices);
          updatedRow.onSalePriceMin = Math.min(...prices);
        }
      }
    }

    newValue[rowIndex] = recalcRowFormulas(updatedRow, columns, formData);
    onChange?.(newValue);
  }, [value, onChange, columns, formData]);

  /** 更新同行多个字段（ERP 字段 nameField + autoFill 写入），同时重算行内公式 */
  const handleRowUpdate = useCallback((rowIndex: number, updates: Record<string, unknown>) => {
    const newValue = [...value];
    const updatedRow = { ...newValue[rowIndex], ...updates };
    newValue[rowIndex] = recalcRowFormulas(updatedRow, columns, formData);
    onChange?.(newValue);
  }, [value, onChange, columns, formData]);

  // ─── 构建列定义（支持 columnGroup 分组表头） ───

  /** 构建单个列定义 */
  const buildColumnDef = (col: FormField, globalIdx: number) => ({
    title: isReadonly ? col.label : col.label + (col.required ? ' *' : ''),
    dataIndex: col.key,
    key: col.key,
    width: colWidths[col.key] || getColumnWidth(col),
    ...(isReadonly && NUMERIC_ALIGN_TYPES.has(col.type) ? { align: 'right' as const } : {}),
    ...(fixFirstCol && globalIdx === 0 && !isReadonly ? { fixed: 'left' as const } : {}),
    render: (_: unknown, record: Record<string, unknown>, rowIndex: number) => {
      if (isReadonly) {
        return renderCellValue(col, record[col.key], record, resolvedMap);
      }
      return (
        <CellInput
          childField={col}
          value={record[col.key]}
          onChange={(v) => handleCellChange(rowIndex, col.key, v)}
          rowData={record}
          onRowUpdate={(updates) => handleRowUpdate(rowIndex, updates)}
          disabled={isDisabled || !!col.disabled || subFieldPermissions?.[col.key] === 'readonly'}
          onBlur={() => recalcColumn(col.key)}
        />
      );
    },
  });

  // 按 columnGroup 分组，保持列顺序
  const processedGroups = new Set<string>();
  const tableColumns: Record<string, unknown>[] = [];

  visibleColumns.forEach((col, idx) => {
    if (col.columnGroup) {
      if (!processedGroups.has(col.columnGroup)) {
        processedGroups.add(col.columnGroup);
        const groupChildren = visibleColumns.filter(c => c.columnGroup === col.columnGroup);
        const tip = groupChildren.find(c => c.columnGroupTip)?.columnGroupTip;
        tableColumns.push({
          title: tip
            ? <>{col.columnGroup} <span style={{ color: '#999', fontWeight: 'normal', fontSize: 12 }}>{tip}</span></>
            : col.columnGroup,
          key: `_group_${col.columnGroup}`,
          children: groupChildren.map(gc => {
            const globalIdx = visibleColumns.indexOf(gc);
            return buildColumnDef(gc, globalIdx);
          }),
        });
      }
    } else {
      tableColumns.push(buildColumnDef(col, idx));
    }
  });

  // 只读、行锁定或整体 disabled 时不显示删除操作列
  if (!isReadonly && !isDisabled && !field.rowLocked) {
    tableColumns.push({
      title: '',
      key: '_action',
      width: 50,
      render: (_: unknown, __: unknown, rowIndex: number) => (
        <Popconfirm title="确定删除此行？" onConfirm={() => handleRemove(rowIndex)} okText="确定" cancelText="取消">
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    });
  }

  // columnWidthsSum 需要展开分组列后求和
  const flattenWidths = (cols: Record<string, unknown>[]): number =>
    cols.reduce((sum, c) => {
      if (Array.isArray(c.children)) return sum + flattenWidths(c.children as Record<string, unknown>[]);
      return sum + ((c.width as number) || 0);
    }, 0);
  const columnWidthsSum = flattenWidths(tableColumns);

  return (
    <div ref={containerRef} className={styles.tableFieldWrapper}>
      {/* 分摊操作区：标准 Form.Item 渲染，与其他表单字段视觉一致 */}
      {showAllocateBar && (
        <div className={styles.allocateToolbar}>
          <Form.Item label="分摊总金额" style={{ marginBottom: 8 }}>
            <InputNumber
              style={{ width: 160 }}
              precision={2}
              min={0}
              placeholder="请输入总金额"
              suffix="元"
              value={allocateAmount}
              onChange={(v) => setAllocateAmount(v as number | null)}
            />
          </Form.Item>
          <Form.Item label="分摊方式" style={{ marginBottom: 8 }}>
            <Select
              style={{ width: 140 }}
              placeholder="选择分摊方式"
              options={allocateMethodOptions}
              onChange={handleAllocate}
              disabled={allocateAmount == null || allocateAmount <= 0}
            />
          </Form.Item>
        </div>
      )}
      <Table
        columns={tableColumns}
        dataSource={value.map((row, idx) => ({ ...row, _key: idx }))}
        rowKey="_key"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: containerWidth > 0 ? Math.max(containerWidth, columnWidthsSum) : columnWidthsSum }}
        summary={hasSummary ? () => (
          <Table.Summary.Row>
            {visibleColumns.map((col, idx) => {
              if (!summaryKeys.has(col.key)) {
                return <Table.Summary.Cell key={col.key} index={idx}>-</Table.Summary.Cell>;
              }
              const values = value!.map(r => Number(r[col.key]) || 0);
              const total = values.reduce((a, b) => a + b, 0);
              const precision = col.formulaPrecision ?? 2;
              return (
                <Table.Summary.Cell key={col.key} index={idx} align="right">
                  <strong>{total.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}</strong>
                </Table.Summary.Cell>
              );
            })}
          </Table.Summary.Row>
        ) : undefined}
      />
      {!isReadonly && !isDisabled && !field.rowLocked && (
        <Button
          type="dashed"
          onClick={handleAdd}
          icon={<PlusOutlined />}
          style={{
            width: containerWidth > 0 ? Math.max(containerWidth, columnWidthsSum) : columnWidthsSum || '100%',
            marginTop: 8,
            justifyContent: 'flex-start',
            paddingLeft: 24,
          }}
        >
          添加一行
        </Button>
      )}
    </div>
  );
};

export default TableFieldRenderer;
