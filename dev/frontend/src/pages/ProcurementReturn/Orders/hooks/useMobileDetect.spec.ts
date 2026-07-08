/**
 * 移动端检测 Hook 单元测试
 * 测试全局 useMobileDetect (含 150ms 防抖)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileDetect } from '@/hooks/useMobileDetect';

describe('useMobileDetect', () => {
  beforeEach(() => {
    // 默认桌面宽度
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('桌面宽度返回 false', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);
  });

  it('移动宽度返回 true', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it('窗口 resize 时更新（含 150ms 防抖）', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);

    // 模拟 resize 到移动宽度
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });
      window.dispatchEvent(new Event('resize'));
    });

    // 等待 150ms 防抖
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    expect(result.current).toBe(true);
  });

  it('768px 边界值：等于 768 时为移动端', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 768 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it('769px 边界值：大于 768 时为桌面', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 769 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);
  });

  it('卸载时移除 resize 监听', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useMobileDetect());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
