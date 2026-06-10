import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return { ...actual };
});

import ActionModal from './ActionModal';

const defaultProps = {
  visible: true,
  actionType: 'approve' as const,
  actionComment: '',
  actionLoading: false,
  countersignUserIds: [] as number[],
  countersignType: 'after' as 'before' | 'after',
  onCountersignUserIdsChange: vi.fn(),
  onCountersignTypeChange: vi.fn(),
  onOk: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
  onCommentChange: vi.fn(),
  onTransferUserChange: vi.fn(),
};

describe('ActionModal', () => {
  it('approve 类型（审批型）标题为"已通过"', () => {
    render(<ActionModal {...defaultProps} actionType="approve" />);
    expect(screen.getByText('已通过')).toBeTruthy();
  });

  it('approve 类型（操作型）标题为"确认完成"', () => {
    render(<ActionModal {...defaultProps} actionType="approve" interactionType="operation" />);
    expect(screen.getByText('确认完成')).toBeTruthy();
  });

  it('reject 类型（审批型）标题为"已拒绝"', () => {
    render(<ActionModal {...defaultProps} actionType="reject" />);
    expect(screen.getByText('已拒绝')).toBeTruthy();
  });

  it('reject 类型（操作型）标题为"拒绝"', () => {
    render(<ActionModal {...defaultProps} actionType="reject" interactionType="operation" />);
    expect(screen.getByText('拒绝')).toBeTruthy();
  });

  it('transfer 类型标题为"转交"', () => {
    render(<ActionModal {...defaultProps} actionType="transfer" />);
    expect(screen.getByText('转交')).toBeTruthy();
  });

  it('countersign 类型标题为"加签处理"', () => {
    render(<ActionModal {...defaultProps} actionType="countersign" />);
    expect(screen.getByText('加签处理')).toBeTruthy();
  });

  it('update 类型（操作型）标题为"更新数据"', () => {
    render(<ActionModal {...defaultProps} actionType="update" interactionType="operation" />);
    expect(screen.getByText('更新数据')).toBeTruthy();
  });

  it('actionLoading=true 时确认按钮 loading', () => {
    render(<ActionModal {...defaultProps} actionLoading={true} />);
    // Ant Design Modal 按钮文本可能有空格
    const okButton = screen.getByRole('button', { name: /确.*定/ });
    expect(okButton.closest('.ant-btn-loading') || okButton.querySelector('.ant-btn-loading-icon')).toBeTruthy();
  });

  it('审批意见输入框存在', () => {
    render(<ActionModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('请输入审批意见（选填）')).toBeTruthy();
  });

  it('actionComment 值绑定到 TextArea', () => {
    render(<ActionModal {...defaultProps} actionComment="测试意见" />);
    const textarea = screen.getByPlaceholderText('请输入审批意见（选填）');
    expect((textarea as HTMLTextAreaElement).value).toBe('测试意见');
  });

  it('transfer 类型显示转交人员 Select', () => {
    render(
      <ActionModal
        {...defaultProps}
        actionType="transfer"
        transferUsers={[{ id: 1, name: '张三' }]}
      />
    );
    expect(screen.getByText('转交人员：')).toBeTruthy();
  });

  it('update 类型不显示转交人员 Select', () => {
    render(<ActionModal {...defaultProps} actionType="update" />);
    expect(screen.queryByText('转交人员：')).toBeNull();
  });

  it('approve 类型不显示转交人员 Select', () => {
    render(<ActionModal {...defaultProps} actionType="approve" />);
    expect(screen.queryByText('转交人员：')).toBeNull();
  });

  it('countersign 类型显示加签类型 Segmented', () => {
    render(<ActionModal {...defaultProps} actionType="countersign" />);
    expect(screen.getByText('加签类型：')).toBeTruthy();
  });

  it('countersign 类型显示加签人员 Select', () => {
    render(
      <ActionModal
        {...defaultProps}
        actionType="countersign"
        transferUsers={[{ id: 1, name: '张三' }, { id: 2, name: '李四' }]}
      />
    );
    expect(screen.getByText('加签人员：')).toBeTruthy();
  });

  it('countersign 类型不显示转交人员 Select', () => {
    render(<ActionModal {...defaultProps} actionType="countersign" />);
    expect(screen.queryByText('转交人员：')).toBeNull();
  });

  it('approve 类型不显示加签 UI', () => {
    render(<ActionModal {...defaultProps} actionType="approve" />);
    expect(screen.queryByText('加签类型：')).toBeNull();
    expect(screen.queryByText('加签人员：')).toBeNull();
  });
});
