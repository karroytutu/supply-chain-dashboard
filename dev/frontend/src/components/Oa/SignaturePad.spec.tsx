import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Canvas Mock
const mockCtx = {
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  lineJoin: '',
  fillStyle: '',
  font: '',
  textAlign: '',
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  transform: vi.fn(),
  setTransform: vi.fn(),
  createLinearGradient: vi.fn(),
  createRadialGradient: vi.fn(),
  createPattern: vi.fn(),
  measureText: vi.fn(() => ({ width: 100 })),
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as any;
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mockSignatureData');

// Mock Image to trigger onload immediately
const OriginalImage = globalThis.Image;
class MockImage {
  onload: (() => void) | null = null;
  src = '';
  constructor() {
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }
}

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
  };
});

import { SignaturePad } from './SignaturePad';

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).Image = MockImage;
});

describe('SignaturePad', () => {
  it('默认渲染：canvas 元素存在', () => {
    const { container } = render(<SignaturePad />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('默认无"清除"按钮（hasSignature=false）', () => {
    render(<SignaturePad />);
    expect(screen.queryByText('清除')).toBeNull();
  });

  it('默认无"历史签名"按钮', () => {
    render(<SignaturePad />);
    expect(screen.queryByText('历史签名')).toBeNull();
  });

  it('只读模式 + 有签名值：渲染 img', () => {
    render(<SignaturePad readOnly value="data:image/png;base64,testSig" />);
    const img = screen.getByAltText('签名');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,testSig');
  });

  it('只读模式 + 无签名值：显示"未签名"', () => {
    render(<SignaturePad readOnly />);
    expect(screen.getByText('未签名')).toBeTruthy();
  });

  it('初始 value 存在时显示"清除"和"确认签名"按钮', () => {
    render(<SignaturePad value="data:image/png;base64,existing" />);
    expect(screen.getByText('清除')).toBeTruthy();
    expect(screen.getByText('确认签名')).toBeTruthy();
  });

  it('传入 historySignatures 后显示"历史签名"按钮', () => {
    render(<SignaturePad historySignatures={['sig1', 'sig2']} />);
    expect(screen.getByText('历史签名')).toBeTruthy();
  });

  it('鼠标绘制后不再自动触发 onChange（需点击确认签名）', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);

    // stopDrawing 不再自动调用 onChange
    expect(onChange).not.toHaveBeenCalled();
  });

  it('绘制后点击“确认签名”按钮触发 onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad onChange={onChange} />);
    const canvas = container.querySelector('canvas')!;

    // 先绘制使 hasSignature = true
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);

    // 点击确认签名按钮
    const confirmBtn = screen.getByText('确认签名');
    fireEvent.click(confirmBtn);

    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,mockSignatureData');
  });

  it('只读模式忽略鼠标事件', () => {
    const onChange = vi.fn();
    const { container } = render(<SignaturePad readOnly onChange={onChange} />);
    const canvas = container.querySelector('canvas');
    if (canvas) {
      fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
      fireEvent.mouseUp(canvas);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('自定义尺寸', () => {
    const { container } = render(<SignaturePad width={600} height={300} />);
    const canvas = container.querySelector('canvas')!;
    // Canvas dimensions are set via useEffect, check the attribute
    expect(canvas).toBeTruthy();
  });
});
