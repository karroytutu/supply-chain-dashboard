/**
 * ActionCard 消息构建器
 * 使用建造者模式构建 ActionCard 消息内容
 */

import type { ActionCardContent, ActionCardButton } from '../dingtalk.types';

export class ActionCardBuilder {
  private title: string = '';
  private markdown: string = '';
  private buttons: ActionCardButton[] = [];
  private singleUrl?: string;
  private singleTitle?: string;
  private btnOrientation: '0' | '1' = '0';

  /**
   * 设置标题
   */
  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(markdown: string): this {
    this.markdown = markdown;
    return this;
  }

  /**
   * 追加 Markdown 内容
   */
  appendMarkdown(content: string): this {
    this.markdown += content;
    return this;
  }

  /**
   * 添加按钮（最多2个）
   */
  addButton(title: string, url: string): this {
    if (this.buttons.length >= 2) {
      console.warn('[ActionCardBuilder] 按钮数量已达到上限（2个），忽略添加');
      return this;
    }
    this.buttons.push({ title, actionUrl: url });
    return this;
  }

  /**
   * 设置单按钮模式
   * 使用单按钮模式时，btnJsonList 将被忽略
   */
  setSingleUrl(url: string, title: string = '查看详情'): this {
    this.singleUrl = url;
    this.singleTitle = title;
    return this;
  }

  /**
   * 设置按钮排列方向
   * @param orientation 0-竖直排列，1-横向排列
   */
  setBtnOrientation(orientation: '0' | '1'): this {
    this.btnOrientation = orientation;
    return this;
  }

  /**
   * 构建消息内容
   */
  build(): ActionCardContent {
    const content: ActionCardContent = {
      title: this.title,
      markdown: this.markdown,
    };

    if (this.singleUrl) {
      content.singleUrl = this.singleUrl;
      content.singleTitle = this.singleTitle || '查看详情';
    } else if (this.buttons.length > 0) {
      content.btnJsonList = this.buttons;
      content.btnOrientation = this.btnOrientation;
    }

    return content;
  }

  /**
   * 重置构建器
   */
  reset(): this {
    this.title = '';
    this.markdown = '';
    this.buttons = [];
    this.singleUrl = undefined;
    this.singleTitle = undefined;
    this.btnOrientation = '0';
    return this;
  }
}

/**
 * 快速创建带单按钮的 ActionCard 消息
 */
export function createSimpleActionCard(
  title: string,
  markdown: string,
  buttonTitle: string = '查看详情',
  buttonUrl: string
): ActionCardContent {
  return new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(buttonUrl, buttonTitle)
    .build();
}
