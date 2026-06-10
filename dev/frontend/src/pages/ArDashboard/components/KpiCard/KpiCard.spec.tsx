/**
 * KpiCard 组件单元测试
 * 测试 null 值兜底、辅助信息显示、点击事件
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import KpiCard from './index';

describe('KpiCard', () => {
  const baseData: KpiCardData = {
    key: 'test',
    title: '测试指标',
    value: 12345,
    unit: '元',
    valueColor: '#1890ff',
  };

  it('正常渲染标题和值', () => {
    render(<KpiCard data={baseData} />);
    expect(screen.getByText('测试指标')).toBeTruthy();
    // 12345元 >= 10000 → 显示 1.2万
    expect(screen.getByText('1.2万')).toBeTruthy();
    expect(screen.getByText('元')).toBeTruthy();
  });

  it('value 为 null 时显示 "--"', () => {
    const data: KpiCardData = { ...baseData, value: null };
    render(<KpiCard data={data} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('小额值不做万级转换', () => {
    const data: KpiCardData = { ...baseData, value: 500, unit: '笔' };
    render(<KpiCard data={data} />);
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('笔')).toBeTruthy();
  });

  it('辅助信息正确渲染', () => {
    const data: KpiCardData = {
      ...baseData,
      auxiliary: [
        { label: '涉及金额', value: '¥128,500' },
        { label: '涉及客户', value: '8 家' },
      ],
    };
    render(<KpiCard data={data} />);
    expect(screen.getByText(/涉及金额/)).toBeTruthy();
    expect(screen.getByText(/¥128,500/)).toBeTruthy();
    expect(screen.getByText(/涉及客户/)).toBeTruthy();
  });

  it('onClick 回调触发', () => {
    const onClick = vi.fn();
    render(<KpiCard data={baseData} onClick={onClick} />);
    // 点击卡片
    const card = screen.getByText('测试指标').closest('.ant-card');
    if (card) fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('无 onClick 时不可点击', () => {
    render(<KpiCard data={baseData} />);
    const card = screen.getByText('测试指标').closest('.ant-card');
    expect(card?.className).not.toContain('clickable');
  });
});
