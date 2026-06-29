import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { FormField } from '@/types/oa';

// Mock dependencies
vi.mock('@/services/api/erp-reference', () => ({
  erpReferenceApi: { resolveErpNames: vi.fn() },
}));
vi.mock('umi', () => ({
  history: { push: vi.fn() },
}));
vi.mock('./ErpNameDisplay', () => ({
  default: ({ value }: any) => <span data-testid="erp-name">{value}</span>,
}));
vi.mock('./PhotoFieldDisplay', () => ({
  default: ({ value }: any) => <span data-testid="photo-field">{String(value)}</span>,
}));
vi.mock('./cellValueRenderer', () => ({
  renderCellValue: (col: any, val: any) => String(val ?? '-'),
}));
vi.mock('@/utils/oa', () => ({
  getFieldLinkUrl: () => null,
}));
vi.mock('@/constants/oa-erp', () => ({
  ERP_SEARCH_API_MAP: {},
}));

import FieldRenderer from './FormFieldRenderer';

describe('FormFieldRenderer', () => {
  it('table + searchApi 从 _details 自动读取结构化明细渲染', () => {
    const field: FormField = {
      key: 'holdSettlementOrders',
      label: '结算单',
      type: 'table',
      required: false,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      labelKey: 'bizStr',
      amountKey: 'leftAmount',
    } as any;

    const formData = {
      holdSettlementOrders: [1, 2],
      _details: {
        holdSettlementOrders: [
          { bizStr: 'SO001', leftAmount: '1000.50' },
          { bizStr: 'SO002', leftAmount: '2000.00' },
        ],
      },
    };

    render(
      <FieldRenderer
        field={field}
        value={[1, 2]}
        formData={formData}
      />,
    );

    expect(screen.getByText('SO001')).toBeInTheDocument();
    expect(screen.getByText('SO002')).toBeInTheDocument();
    // 合计金额: 1000.50 + 2000.00 = 3000.50 → ¥3,000.50
    expect(screen.getByText(/合计/)).toBeInTheDocument();
    expect(screen.getByText('¥3,000.50')).toBeInTheDocument();
  });

  it('table + searchApi 无 _details 时降级显示原始 ID', () => {
    const field: FormField = {
      key: 'holdSettlementOrders',
      label: '结算单',
      type: 'table',
      required: false,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      labelKey: 'bizStr',
    } as any;

    const formData = {
      holdSettlementOrders: [101, 202],
    };

    render(
      <FieldRenderer
        field={field}
        value={[101, 202]}
        formData={formData}
      />,
    );

    // 降级后显示原始 ID
    expect(screen.getByText('101, 202')).toBeInTheDocument();
  });

  it('空值渲染为 -', () => {
    const field: FormField = {
      key: 'remark',
      label: '备注',
      type: 'text',
      required: false,
    } as any;

    render(<FieldRenderer field={field} value={null} />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('金额字段渲染', () => {
    const field: FormField = {
      key: 'amount',
      label: '金额',
      type: 'money',
      required: false,
    } as any;

    render(<FieldRenderer field={field} value={1234.5} />);

    // formatCurrency 格式化为 ¥1,234.50
    expect(screen.getByText('¥1,234.50')).toBeInTheDocument();
  });

  it('signature 类型有签名值：渲染 img', () => {
    const field: FormField = {
      key: 'sig',
      label: '签名',
      type: 'signature',
      required: false,
    } as any;

    render(<FieldRenderer field={field} value="data:image/png;base64,abc123" />);

    const img = screen.getByAltText('签名');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
  });

  it('signature 类型空值：显示 -（被顶部空值检查拦截）', () => {
    const field: FormField = {
      key: 'sig',
      label: '签名',
      type: 'signature',
      required: false,
    } as any;

    render(<FieldRenderer field={field} value={null} />);

    // 空值被 L32 的 null/undefined 检查拦截，返回 - 而非走到 signature case
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
