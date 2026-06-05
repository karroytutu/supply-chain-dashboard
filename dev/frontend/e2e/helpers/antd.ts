/**
 * Antd 组件 E2E 交互封装
 * Antd 的 Modal/Select/DatePicker 等组件挂载到 body 下，
 * DOM 结构特殊，需要专用的选择器和交互方法
 */

import { type Page, type Locator, expect } from '@playwright/test';

/**
 * 等待页面加载完成（DOM + 有限时间的网络等待）
 * 注意：不使用 networkidle，因为部分页面（如数据总览）有持续的 API 轮询，
 * 会导致 networkidle 永远不触发。
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // 给网络请求一个短暂的窗口期，但不强制等待 networkidle
  await page.waitForTimeout(500);
}

/**
 * 在 Antd Select 中选择指定选项
 * Antd Select 的下拉菜单挂载在 body 下，不能直接用 select 的 locator 点击
 *
 * @param page Page 实例
 * @param selectLocator Select 组件的 locator
 * @param optionText 选项文本内容
 */
export async function selectAntdOption(
  page: Page,
  selectLocator: Locator,
  optionText: string,
): Promise<void> {
  await selectLocator.click();
  // 下拉菜单出现在 body 下的 .ant-select-dropdown 中
  const option = page.locator('.ant-select-item-option-content', { hasText: optionText });
  await option.waitFor({ state: 'visible', timeout: 3000 });
  await option.click();
}

/**
 * 填写 Antd Form 表单
 * 根据 label 文本定位输入框并填写值
 *
 * @param page Page 实例
 * @param fields 字段配置：{ label: value } 键值对
 */
export async function fillAntdForm(
  page: Page,
  fields: Record<string, string>,
): Promise<void> {
  for (const [label, value] of Object.entries(fields)) {
    const formItem = page.locator('.ant-form-item', { hasText: label });
    const input = formItem.locator('input, textarea').first();
    await input.fill(value);
  }
}

/**
 * 点击 Antd Modal 的确认按钮
 * Modal 挂载在 body 下，不在页面 DOM 树内
 *
 * @param page Page 实例
 * @param buttonText 按钮文本（默认 "确定"）
 */
export async function confirmModal(page: Page, buttonText = '确定'): Promise<void> {
  const modal = page.locator('.ant-modal').last();
  await modal.waitFor({ state: 'visible' });
  const button = modal.getByRole('button', { name: buttonText });
  await button.click();
}

/**
 * 关闭 Antd Modal（点击 X 按钮）
 */
export async function closeModal(page: Page): Promise<void> {
  const modal = page.locator('.ant-modal').last();
  await modal.locator('.ant-modal-close').click();
}

/**
 * 等待 Antd Table 加载完成
 * 等待 loading 指示器消失
 */
export async function waitForTableLoad(page: Page): Promise<void> {
  const spinner = page.locator('.ant-table-wrapper .ant-spin');
  // 如果 spinner 不存在则直接返回
  if (await spinner.count() === 0) return;
  await spinner.waitFor({ state: 'hidden', timeout: 10000 });
}

/**
 * 获取 Antd Table 的行数
 */
export async function getTableRowCount(page: Page): Promise<number> {
  await waitForTableLoad(page);
  return page.locator('.ant-table-tbody tr.ant-table-row').count();
}

/**
 * 点击 Antd Popconfirm 的确认按钮
 * Popconfirm 也挂载在 body 下
 */
export async function confirmPopconfirm(page: Page, buttonText = '确定'): Promise<void> {
  const popconfirm = page.locator('.ant-popconfirm').last();
  await popconfirm.getByRole('button', { name: buttonText }).click();
}

/**
 * 等待 Antd message 提示出现
 * @param page Page 实例
 * @param text 预期消息文本
 */
export async function waitForMessage(page: Page, text: string): Promise<void> {
  const message = page.locator('.ant-message-notice', { hasText: text });
  await message.waitFor({ state: 'visible', timeout: 5000 });
}
