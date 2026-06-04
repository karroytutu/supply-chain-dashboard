/**
 * React 组件测试渲染工具
 * 包装 @testing-library/react 的 render，自动注入项目通用 Provider
 * 提供 renderWithProviders 和 renderHookWithProviders 两个方法
 *
 * @example
 * import { renderWithProviders, screen } from '../__tests__/helpers/renderWithProviders';
 *
 * renderWithProviders(<MyComponent prop="value" />);
 * expect(screen.getByText('Expected Text')).toBeInTheDocument();
 */

import React, { type ReactElement } from 'react';
import { render, renderHook, type RenderOptions, type RenderHookOptions } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

interface WrapperOptions {
  /** 额外包裹的 Provider（如自定义 Context） */
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * 创建包含项目通用 Provider 的 wrapper 组件
 */
function createWrapper(options?: WrapperOptions): React.ComponentType<{ children: React.ReactNode }> {
  const InnerWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let element = (
      <ConfigProvider locale={zhCN}>
        {children}
      </ConfigProvider>
    );

    if (options?.wrapper) {
      const CustomWrapper = options.wrapper;
      element = <CustomWrapper>{element}</CustomWrapper>;
    }

    return element;
  };

  return InnerWrapper;
}

/**
 * 渲染 React 组件，自动注入 ConfigProvider 等通用 Provider
 * @param ui 要渲染的组件
 * @param options 渲染选项
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & WrapperOptions,
) {
  const { wrapper: customWrapper, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: createWrapper({ wrapper: customWrapper }),
    ...renderOptions,
  });
}

/**
 * 渲染 React Hook，自动注入 ConfigProvider 等通用 Provider
 * @param hook 要测试的 Hook
 * @param options 渲染选项
 */
export function renderHookWithProviders<T>(
  hook: () => T,
  options?: Omit<RenderHookOptions<unknown>, 'wrapper'> & WrapperOptions,
) {
  const { wrapper: customWrapper, ...hookOptions } = options ?? {};
  return renderHook(hook, {
    wrapper: createWrapper({ wrapper: customWrapper }),
    ...hookOptions,
  });
}

// 重新导出 screen 以便使用方不需要额外导入
export { screen, waitFor, within, act } from '@testing-library/react';
