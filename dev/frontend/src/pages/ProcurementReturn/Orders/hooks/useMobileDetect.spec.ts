/**
 * 移动端检测 Hook 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileDetect } from './useMobileDetect';

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

  it('窗口 resize 时更新', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);

    // 模拟 resize 到移动宽度
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe(true);
  });

  it('768px 边界值：等于 768 时为桌面', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 768 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(false);
  });

  it('767px 边界值：小于 768 时为移动', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 767 });

    const { result } = renderHook(() => useMobileDetect());
    expect(result.current).toBe(true);
  });

  it('卸载时移除 resize 监听', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useMobileDetect());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
