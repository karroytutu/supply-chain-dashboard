/**
 * 可编辑金额列表 + 只读小表格
 * @module components/Oa/fields/EditableAmountList
 *
 * EditableAmountList: 在只读基础上增加"本次付款""本次抹零""未结余额"
 * 用于应付单据和预付款单的部分付款/核销场景。
 * 桌面端渲染 table，移动端（<768px）渲染卡片列表，业务逻辑只写一份。
 *
 * ReadonlyTable: 只读小表格（编号+金额+合计行）
 *
 * 数据流：
 * - 读取：从 formData._details[field.key] 读取记录（含 leftAmount 等原始数据）
 * - 写入：用户编辑后，将 paymentAmount/discountAmount 存入 _details 记录中，
 *         表格合计行自动展示各行本次付款/抹零/未结余额的汇总
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Input, Typography } from 'antd';
import { formatCurrency } from '@/utils/format';
import { filterNumberInput, AMOUNT_MAX_LENGTH } from '@/utils/input-filter';
import { useIsMobile } from '@/hooks/useMobileDetect';
import { useEditableForm } from '../EditableFormContext';

const { Text } = Typography;

// =====================================================
// 可编辑金额列表
// =====================================================

interface EditableAmountListProps {
  records: Record<string, unknown>[];
  labelKey: string;
  amountKey: string;
  fieldKey: string;
  disabled?: boolean;
  /** 核销模式（预付款）：只有一列"本次使用金额"，不更新汇总字段 */
  writeoffMode?: boolean;
  /** 存储付款金额的字段名（默认 'paymentAmount'，银行账户用 'amount'） */
  paymentField?: string;
  /** 用户输入存储字段名（与 ERP 原始字段分离，避免 ERP 返回值预填输入框） */
  editField?: string;
  /** 桌面端表头第一列显示文字（默认根据 labelKey 推断） */
  labelHeader?: string;
}

export function EditableAmountList({
  records,
  labelKey,
  amountKey,
  fieldKey,
  disabled = false,
  writeoffMode = false,
  paymentField = 'paymentAmount',
  editField,
  labelHeader,
}: EditableAmountListProps) {
  const editableForm = useEditableForm();
  // 内部状态管理：存储原始字符串值，避免 InputNumber 受控模式小数点丢失问题
  const fieldName = writeoffMode ? 'writeOffAmount' : paymentField;
  // editField：用户输入实际存储的字段名，与 ERP 原始字段分离
  // 例：预付款核销 editField='useAmount'，避免读取 ERP 的 writeOffAmount（已核销累计值）预填输入框
  const inputFieldName = editField || fieldName;
  const isMobile = useIsMobile();

  // 初始化函数：当 inputFieldName 为空时回退到 amountKey（leftAmount），实现自动填充剩余金额
  const initRowAmounts = (recs: Record<string, unknown>[]) =>
    recs.map(r => {
      const existing = r[inputFieldName];
      const left = r[amountKey];
      const leftNum = parseFloat(String(left || 0));
      const paidDefault = existing != null && String(existing) !== ''
        ? String(existing)
        : (left != null ? Number(left).toFixed(2) : '');
      // 退货单据（left < 0）不允许抹零，强制为 0
      const discountDefault = leftNum < 0 ? '0' : String(r.discountAmount || '');
      return { paid: paidDefault, discount: discountDefault };
    });

  // 同步默认值到 _details，确保后端 beforeSubmit 能读到 paymentAmount
  const syncToDetails = (recs: Record<string, unknown>[], amounts: { paid: string; discount: string }[]) => {
    if (!editableForm) return;
    const details = (editableForm.getFieldValue('_details') as Record<string, unknown>) || {};
    const updated = recs.map((r, i) => {
      const leftNum = parseFloat(String(r[amountKey] || 0));
      return {
        ...r,
        [inputFieldName]: amounts[i].paid || '0',
        // 退货行强制抹零为 0，确保 _details 与 UI 一致
        ...(leftNum < 0 ? { discountAmount: '0' } : {}),
      };
    });
    editableForm.setFieldsValue({ _details: { ...details, [fieldKey]: updated } });
  };

  const [rowAmounts, setRowAmounts] = useState<{ paid: string; discount: string }[]>(
    () => initRowAmounts(records)
  );

  // 仅在单据选择变化时重新初始化（用 ID 指纹判断，避免父组件重渲染时反复重置）
  const recordFingerprint = records.map(r => String(r[labelKey] || '')).join(',');
  const prevFingerprintRef = useRef(recordFingerprint);
  if (prevFingerprintRef.current !== recordFingerprint) {
    prevFingerprintRef.current = recordFingerprint;
    const nextAmounts = initRowAmounts(records);
    setRowAmounts(nextAmounts);
    // 单据变更时直接用新计算的值同步 _details，避免 useEffect 闭包陈旧值问题
    syncToDetails(records, nextAmounts);
  }

  // 首次挂载同步：确保初始值写入 _details（在 commit 阶段执行）
  const mountSyncedRef = useRef(false);
  useEffect(() => {
    if (!mountSyncedRef.current) {
      mountSyncedRef.current = true;
      syncToDetails(records, rowAmounts);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (records.length === 0) return <Text type="secondary">-</Text>;

  // 阻止输入框点击事件冒泡到父级 div（避免触发 openModal）
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  const updateAmount = (index: number, field: string, rawValue: string) => {
    // 1. 更新内部状态（存储原始字符串，保留小数点输入）
    setRowAmounts(prev => {
      const next = [...prev];
      if (field === 'discountAmount') {
        next[index] = { ...next[index], discount: rawValue };
      } else {
        next[index] = { ...next[index], paid: rawValue };
      }
      return next;
    });
    // 2. 同步更新 _details（持久化存储）
    if (editableForm) {
      const details = (editableForm.getFieldValue('_details') as Record<string, unknown>) || {};
      const updated = [...((details[fieldKey] || []) as Record<string, unknown>[])];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: rawValue || '0' };
        editableForm.setFieldsValue({ _details: { ...details, [fieldKey]: updated } });
      }
    }
  };

  // 失焦时校验：截断超出范围的值
  const validateOnBlur = (index: number) => {
    const left = parseFloat(String(records[index]?.[amountKey] || 0));
    const currentPaid = parseFloat(rowAmounts[index]?.paid || '0') || 0;

    // 核销模式：校验付款金额不超过自身可用余额 + 不超过本次付款合计上限
    if (writeoffMode) {
      let maxPaid = left; // 默认上限为自身可用余额
      // 核销模式：额外校验合计不超过本次付款合计（从 _details.debtIds 各行本次付款求和）
      // 未编辑过的债务行没有 paymentAmount，回退到 leftAmount（默认全额支付）
      if (writeoffMode && editableForm) {
        const details = (editableForm.getFieldValue('_details') as Record<string, unknown>) || {};
        const debtRows = (details.debtIds || []) as Array<{ paymentAmount?: string; leftAmount?: string }>;
        const totalPaymentAmount = debtRows.reduce((sum, d) =>
          sum + (parseFloat(String(d.paymentAmount ?? d.leftAmount ?? 0))), 0);
        if (totalPaymentAmount > 0) {
          const otherSum = rowAmounts.reduce((s, r, i) =>
            s + (i === index ? 0 : (parseFloat(r.paid || '0') || 0)), 0);
          const remaining = Math.round(Math.max(0, totalPaymentAmount - otherSum) * 100) / 100;
          maxPaid = Math.min(maxPaid, remaining);
        }
      }
      // 根据 left 正负方向分别截断
      const clampedPaid = left >= 0
        ? Math.min(Math.max(0, currentPaid), maxPaid)   // [0, maxPaid]
        : Math.max(Math.min(0, currentPaid), left);     // [left, 0]
      if (clampedPaid !== currentPaid) {
        const newPaidStr = clampedPaid !== 0 ? String(clampedPaid) : '';
        setRowAmounts(prev => {
          const next = [...prev];
          next[index] = { ...next[index], paid: newPaidStr };
          return next;
        });
        if (editableForm) {
          const details = (editableForm.getFieldValue('_details') as Record<string, unknown>) || {};
          const updated = [...((details[fieldKey] || []) as Record<string, unknown>[])];
          if (updated[index]) {
            updated[index] = { ...updated[index], [inputFieldName]: newPaidStr };
            editableForm.setFieldsValue({ _details: { ...details, [fieldKey]: updated } });
          }
        }
      }
      return;
    }

    // 付款模式：根据 left 正负方向校验付款 + 抹零
    const currentDiscount = parseFloat(rowAmounts[index]?.discount || '0') || 0;
    let clampedPaid: number;
    if (left >= 0) {
      clampedPaid = Math.min(Math.max(0, currentPaid), left);    // [0, left]
    } else {
      clampedPaid = Math.max(Math.min(0, currentPaid), left);    // [left, 0]
    }
    // 退货单据（left < 0）不需要抹零，抹零强制为 0
    const maxDiscount = left >= 0
      ? Math.round(Math.max(0, left - clampedPaid) * 100) / 100
      : 0;
    const clampedDiscount = Math.min(Math.max(0, currentDiscount), maxDiscount);

    if (clampedPaid !== currentPaid || clampedDiscount !== currentDiscount) {
      const newPaidStr = clampedPaid !== 0 ? String(clampedPaid) : '';
      const newDiscountStr = clampedDiscount > 0 ? String(clampedDiscount) : '';
      setRowAmounts(prev => {
        const next = [...prev];
        next[index] = { paid: newPaidStr, discount: newDiscountStr };
        return next;
      });
      if (editableForm) {
        const details = (editableForm.getFieldValue('_details') as Record<string, unknown>) || {};
        const updated = [...((details[fieldKey] || []) as Record<string, unknown>[])];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            [inputFieldName]: newPaidStr || '0',
            discountAmount: newDiscountStr || '0',
          };
          editableForm.setFieldsValue({ _details: { ...details, [fieldKey]: updated } });
        }
      }
    }
  };

  // 合计计算：独立 useMemo，不依赖渲染过程
  const sums = useMemo(() => {
    return records.reduce((acc, r, i) => {
      const left = parseFloat(String(r[amountKey] || 0));
      const paid = parseFloat(rowAmounts[i]?.paid || '0') || 0;
      const discount = writeoffMode ? 0 : (parseFloat(rowAmounts[i]?.discount || '0') || 0);
      const remaining = writeoffMode
        ? Math.round((left - paid) * 100) / 100
        : Math.round((left - paid - discount) * 100) / 100;
      return {
        sumLeft: acc.sumLeft + left,
        sumPaid: acc.sumPaid + paid,
        sumDiscount: acc.sumDiscount + discount,
        sumRemaining: acc.sumRemaining + remaining,
      };
    }, { sumLeft: 0, sumPaid: 0, sumDiscount: 0, sumRemaining: 0 });
  }, [records, rowAmounts, amountKey, writeoffMode]);

  // 桌面端样式
  const cellStyle: React.CSSProperties = { padding: '4px 8px 4px 0' };
  const cellStyleR: React.CSSProperties = { padding: '4px 0', textAlign: 'right' as const };
  const borderStyle: React.CSSProperties = { borderTop: '1px solid #f0f0f0' };

  // 移动端样式
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  };
  const cardLabelStyle: React.CSSProperties = { fontSize: 12, color: '#666', marginBottom: 2 };
  const inputRowStyle: React.CSSProperties = { display: 'flex', gap: 8, marginBottom: 6 };
  const inputGroupStyle: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column' as const };

  // 通用标签
  const amountLabel = writeoffMode ? '可用金额' : '剩余金额';
  const editLabel = writeoffMode ? '本次使用金额' : '本次付款';
  const remainLabel = writeoffMode ? '剩余可用金额' : '未结余额';

  // ==================== 渲染行数据 ====================
  const renderRows = () => records.map((r, i) => {
    const left = parseFloat(String(r[amountKey] || 0));
    const paid = parseFloat(rowAmounts[i]?.paid || '0') || 0;
    const discount = writeoffMode ? 0 : (parseFloat(rowAmounts[i]?.discount || '0') || 0);
    const remaining = writeoffMode
      ? Math.round((left - paid) * 100) / 100
      : Math.round((left - paid - discount) * 100) / 100;

    // 付款输入框（桌面/移动端共用）
    const paidInput = disabled ? (
      <span style={{ fontSize: isMobile ? 14 : 13, color: '#333', padding: isMobile ? '4px 0' : undefined }}>{formatCurrency(paid)}</span>
    ) : (
      <Input
        size={isMobile ? undefined : 'small'}
        value={rowAmounts[i]?.paid || ''}
        maxLength={AMOUNT_MAX_LENGTH}
        style={isMobile ? { width: '100%' } : { width: writeoffMode ? 110 : 90, textAlign: 'right' }}
        placeholder="0.00"
        onClick={stopPropagation}
        onBlur={() => validateOnBlur(i)}
        onChange={(e) => updateAmount(i, inputFieldName, filterNumberInput(e.target.value, left < 0))}
      />
    );

    // 抹零输入框（退货单据 left < 0 时禁用）
    const isReturnRow = left < 0;
    const discountInput = disabled ? (
      <span style={{ fontSize: isMobile ? 14 : 13, color: '#333', padding: isMobile ? '4px 0' : undefined }}>{formatCurrency(discount)}</span>
    ) : (
      <Input
        size={isMobile ? undefined : 'small'}
        value={rowAmounts[i]?.discount || ''}
        maxLength={AMOUNT_MAX_LENGTH}
        disabled={isReturnRow}
        style={isMobile ? { width: '100%' } : { width: 70, textAlign: 'right' }}
        placeholder="0.00"
        onClick={stopPropagation}
        onBlur={() => validateOnBlur(i)}
        onChange={(e) => updateAmount(i, 'discountAmount', filterNumberInput(e.target.value))}
      />
    );

    // ─── 移动端：卡片 ───
    if (isMobile) {
      return (
        <div key={i} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{String(r[labelKey] || '-')}</span>
            <span style={{ fontSize: 12, color: '#999' }}>{writeoffMode ? '可用' : '剩余'} {formatCurrency(left)}</span>
          </div>
          <div style={inputRowStyle}>
            <div style={inputGroupStyle}>
              <label style={cardLabelStyle}>{editLabel}</label>
              {paidInput}
            </div>
            {!writeoffMode && (
              <div style={inputGroupStyle}>
                <label style={cardLabelStyle}>本次抹零</label>
                {discountInput}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #f5f5f5' }}>
            <span style={{ fontSize: 12, color: '#999' }}>{writeoffMode ? '剩余可用' : '未结余额'}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {formatCurrency(remaining)}
            </span>
          </div>
        </div>
      );
    }

    // ─── 桌面端：表格行 ───
    return (
      <tr key={i}>
        <td style={cellStyle}>{String(r[labelKey] || '-')}</td>
        <td style={{ ...cellStyleR, paddingRight: 8 }}>{formatCurrency(left)}</td>
        <td style={{ ...cellStyleR, paddingRight: 8 }}>{paidInput}</td>
        {!writeoffMode && (
          <td style={{ ...cellStyleR, paddingRight: 8 }}>{discountInput}</td>
        )}
        <td style={cellStyleR}>
          {formatCurrency(remaining)}
        </td>
      </tr>
    );
  });

  const rows = renderRows();

  // ==================== 移动端：卡片列表 + 汇总 ====================
  if (isMobile) {
    return (
      <div onClick={stopPropagation}>
        {rows}
        <div style={{
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: '#666' }}>{writeoffMode ? '可用总额' : '应付总额'}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(sums.sumLeft)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: '#666' }}>{editLabel}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(sums.sumPaid)}</span>
          </div>
          {!writeoffMode && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#666' }}>抹零合计</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(sums.sumDiscount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: '#666' }}>{writeoffMode ? '剩余可用' : '未结余额'}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(sums.sumRemaining)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 桌面端：表格 ====================
  return (
    <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }} onClick={stopPropagation}>
      <thead>
        <tr>
          <th style={{ ...cellStyle, fontWeight: 500, color: '#666', fontSize: 12, paddingBottom: 4 }}>
            {labelHeader || (labelKey === 'paidBillStr' ? '预付款单号' : '单据编号')}
          </th>
          <th style={{ ...cellStyleR, fontWeight: 500, color: '#666', fontSize: 12, paddingBottom: 4, paddingRight: 8 }}>{amountLabel}</th>
          <th style={{ ...cellStyleR, fontWeight: 500, fontSize: 12, paddingBottom: 4, paddingRight: 8 }}>{editLabel}</th>
          {!writeoffMode && (
            <th style={{ ...cellStyleR, fontWeight: 500, fontSize: 12, paddingBottom: 4, paddingRight: 8 }}>本次抹零</th>
          )}
          <th style={{ ...cellStyleR, fontWeight: 500, fontSize: 12, paddingBottom: 4 }}>{remainLabel}</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
      <tfoot>
        <tr>
          <td style={{ ...cellStyle, fontWeight: 500, ...borderStyle }}>合计 ({records.length})</td>
          <td style={{ ...cellStyleR, fontWeight: 500, ...borderStyle, paddingRight: 8 }}>{formatCurrency(sums.sumLeft)}</td>
          <td style={{ ...cellStyleR, fontWeight: 500, ...borderStyle, paddingRight: 8 }}>{formatCurrency(sums.sumPaid)}</td>
          {!writeoffMode && (
            <td style={{ ...cellStyleR, fontWeight: 500, ...borderStyle, paddingRight: 8 }}>{formatCurrency(sums.sumDiscount)}</td>
          )}
          <td style={{ ...cellStyleR, fontWeight: 500, ...borderStyle }}>{formatCurrency(sums.sumRemaining)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// =====================================================
// 只读渲染：小表格
// =====================================================

export function ReadonlyTable({
  records,
  labelKey,
  amountKey,
}: {
  records: Record<string, unknown>[];
  labelKey: string;
  amountKey?: string;
}) {
  if (records.length === 0) return <Text type="secondary">-</Text>;

  const total = amountKey
    ? records.reduce((s, r) => s + (parseFloat(String(r[amountKey] || 0))), 0)
    : 0;

  return (
    <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        {records.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: '2px 8px 2px 0' }}>{String(r[labelKey] || '-')}</td>
            {amountKey && (
              <td style={{ padding: '2px 0', textAlign: 'right' }}>
                {formatCurrency(r[amountKey] as string | number)}
              </td>
            )}
          </tr>
        ))}
        {amountKey && records.length > 1 && (
          <tr>
            <td style={{ padding: '4px 8px 0 0', fontWeight: 500, borderTop: '1px solid #f0f0f0' }}>
              合计 ({records.length})
            </td>
            <td style={{ padding: '4px 0 0', fontWeight: 500, textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
              {formatCurrency(total)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default EditableAmountList;
