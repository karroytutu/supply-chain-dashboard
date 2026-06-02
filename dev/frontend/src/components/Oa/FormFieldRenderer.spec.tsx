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
  it('结算单结构化明细渲染', () => {
    const field: FormField = {
      key: 'holdSettlementOrders',
      label: '结算单',
      type: 'erp_settlement_order',
      required: false,
      detailsField: '_holdSettlementOrderDetails',
    } as any;

    const formData = {
      _holdSettlementOrderDetails: JSON.stringify([
        { bizStr: 'SO001', leftAmount: '1000.50' },
        { bizStr: 'SO002', leftAmount: '2000.00' },
      ]),
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

  it('结算单 JSON 解析失败降级', () => {
    const field: FormField = {
      key: 'holdSettlementOrders',
      label: '结算单',
      type: 'erp_settlement_order',
      required: false,
      detailsField: '_holdSettlementOrderDetails',
      nameField: '_holdSettlementOrderNames',
    } as any;

    const formData = {
      _holdSettlementOrderDetails: 'invalid json{{',
      _holdSettlementOrderNames: 'SO-A, SO-B',
    };

    render(
      <FieldRenderer
        field={field}
        value={[1, 2]}
        formData={formData}
      />,
    );

    // 降级后应该用 nameField 显示
    expect(screen.getByText('SO-A')).toBeInTheDocument();
    expect(screen.getByText('SO-B')).toBeInTheDocument();
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
});
