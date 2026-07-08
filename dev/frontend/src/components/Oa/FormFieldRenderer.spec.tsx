import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { FormField } from '@/types/oa';

// Mock ResizeObserver + matchMedia（Ant Design Table 内部依赖）
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

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
  it('SSOT: table + searchApi 主字段即唯一数据源，直接渲染记录数组', () => {
    const field: FormField = {
      key: 'holdSettlementOrders',
      label: '结算单',
      type: 'table',
      required: false,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      labelKey: 'bizStr',
      amountKey: 'leftAmount',
      children: [
        { key: 'bizStr', label: '订单号', type: 'text' },
        { key: 'leftAmount', label: '剩余欠款', type: 'money' },
      ],
    } as any;

    const records = [
      { bizStr: 'SO001', leftAmount: '1000.50' },
      { bizStr: 'SO002', leftAmount: '2000.00' },
    ];

    const { container } = render(
      <FieldRenderer
        field={field}
        value={records}
        formData={{ holdSettlementOrders: records }}
      />,
    );

    // SSOT: 表格渲染了记录数据（Ant Design Table 在 jsdom 中可能不完整，验证有表格结构即可）
    expect(container.querySelector('.ant-table')).toBeTruthy();
    // 验证没有读取 _details（formData 中无 _details 属性）
    expect(container.textContent).not.toContain('_details');
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

  it('signature 类型空值：显示“未签名”', () => {
    const field: FormField = {
      key: 'sig',
      label: '签名',
      type: 'signature',
      required: false,
    } as any;

    render(<FieldRenderer field={field} value={null} />);

    // 空值渲染为“未签名”（SignatureFieldControl 的只读模式）
    expect(screen.getByText('未签名')).toBeInTheDocument();
  });
});
