/**
 * OA 消息构建器
 * 使用建造者模式构建 OA 消息内容
 */

import type { OaContent, OaFormItem, OaStatusBar } from '../dingtalk.types';
import { STATUS_BAR_COLORS } from '../dingtalk.types';

export class OaBuilder {
  private headText: string = '';
  private headBgColor: string = 'FFCCCCCC';
  private bodyTitle: string = '';
  private bodyContent: string = '';
  private forms: OaFormItem[] = [];
  private messageUrl: string = '';
  private pcMessageUrl?: string;
  private statusBar: OaStatusBar | null = null;

  /**
   * 设置头部
   */
  setHead(text: string, bgColor?: string): this {
    this.headText = text;
    if (bgColor) {
      this.headBgColor = bgColor;
    }
    return this;
  }

  /**
   * 设置主体标题
   */
  setBodyTitle(title: string): this {
    this.bodyTitle = title;
    return this;
  }

  /**
   * 设置主体内容
   */
  setBodyContent(content: string): this {
    this.bodyContent = content;
    return this;
  }

  /**
   * 添加表单项
   */
  addForm(key: string, value: string): this {
    this.forms.push({ key, value });
    return this;
  }

  /**
   * 批量添加表单项
   */
  addForms(items: Array<{ key: string; value: string }>): this {
    this.forms.push(...items);
    return this;
  }

  /**
   * 设置消息跳转 URL
   */
  setMessageUrl(url: string): this {
    this.messageUrl = url;
    return this;
  }

  /**
   * 设置 PC 端跳转 URL
   */
  setPcMessageUrl(url: string): this {
    this.pcMessageUrl = url;
    return this;
  }

  /**
   * 设置状态栏
   */
  setStatusBar(value: string, bg: string): this {
    this.statusBar = { statusValue: value, statusBg: bg };
    return this;
  }

  /**
   * 设置成功状态栏（绿色）
   */
  setSuccessStatus(value: string = '已完成'): this {
    return this.setStatusBar(value, STATUS_BAR_COLORS.SUCCESS);
  }

  /**
   * 设置警告状态栏（橙色）
   */
  setWarningStatus(value: string = '处理中'): this {
    return this.setStatusBar(value, STATUS_BAR_COLORS.WARNING);
  }

  /**
   * 设置错误状态栏（红色）
   */
  setErrorStatus(value: string = '失败'): this {
    return this.setStatusBar(value, STATUS_BAR_COLORS.ERROR);
  }

  /**
   * 设置信息状态栏（蓝色）
   */
  setInfoStatus(value: string = '进行中'): this {
    return this.setStatusBar(value, STATUS_BAR_COLORS.INFO);
  }

  /**
   * 构建消息内容
   */
  build(): OaContent {
    const content: OaContent = {
      messageUrl: this.messageUrl,
    };

    // 头部
    if (this.headText) {
      content.head = {
        text: this.headText,
        bgcolor: this.headBgColor,
      };
    }

    // 主体
    if (this.bodyTitle || this.bodyContent || this.forms.length > 0) {
      content.body = {};
      if (this.bodyTitle) content.body.title = this.bodyTitle;
      if (this.bodyContent) content.body.content = this.bodyContent;
      if (this.forms.length > 0) content.body.form = this.forms;
    }

    // PC 端 URL
    if (this.pcMessageUrl) {
      content.pcMessageUrl = this.pcMessageUrl;
    }

    // 状态栏
    if (this.statusBar) {
      content.statusBar = this.statusBar;
    }

    return content;
  }

  /**
   * 重置构建器
   */
  reset(): this {
    this.headText = '';
    this.headBgColor = 'FFCCCCCC';
    this.bodyTitle = '';
    this.bodyContent = '';
    this.forms = [];
    this.messageUrl = '';
    this.pcMessageUrl = undefined;
    this.statusBar = null;
    return this;
  }
}

/**
 * 快速创建简单 OA 消息
 */
export function createSimpleOa(
  title: string,
  formItems: Array<{ key: string; value: string }>,
  messageUrl: string
): OaContent {
  const builder = new OaBuilder()
    .setHead(title)
    .setMessageUrl(messageUrl);

  for (const item of formItems) {
    builder.addForm(item.key, item.value);
  }

  return builder.build();
}
