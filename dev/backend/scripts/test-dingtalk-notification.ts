/**
 * 钉钉工作通知测试脚本
 * 测试 ActionCard 格式消息发送
 */

import 'dotenv/config';
import {
  sendWorkNotification,
  getSendProgress,
  getSendResult,
  ActionCardBuilder,
  OaBuilder,
  STATUS_BAR_COLORS,
} from '../src/services/dingtalk';

// 文昌盛的钉钉用户ID
const TEST_USER_ID = 'wm2c3iSFB6udbEBhhCGKIMQiEiE';

async function testActionCardMessage() {
  console.log('\n========================================');
  console.log('测试 1: 发送 ActionCard 格式消息');
  console.log('========================================\n');

  const builder = new ActionCardBuilder()
    .setTitle('【测试通知】钉钉工作通知功能测试')
    .setMarkdown(`### 钉钉工作通知功能测试

这是一条 **ActionCard** 格式的测试消息，用于验证钉钉工作通知功能是否正常工作。

| 测试项 | 状态 |
|--------|------|
| ActionCard 格式 | ✅ |
| Markdown 渲染 | ✅ |
| 按钮跳转 | 待验证 |

测试时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

请点击下方按钮验证跳转功能是否正常。`)
    .setSingleUrl('https://xly.gzzxd.com', '跳转到系统');

  const actionCard = builder.build();

  const result = await sendWorkNotification(
    [TEST_USER_ID],
    '【测试通知】钉钉工作通知功能测试',
    '', // ActionCard 格式不需要 content
    {
      msgType: 'actionCard',
      actionCard,
      businessType: 'collection',
      businessNo: 'TEST-001',
    }
  );

  console.log('发送结果:', JSON.stringify(result, null, 2));

  if (result.success && result.taskId) {
    console.log('\n等待 3 秒后查询发送进度...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const progress = await getSendProgress(result.taskId);
    console.log('发送进度:', JSON.stringify(progress, null, 2));

    if (progress.success) {
      console.log('\n等待 5 秒后查询发送结果...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      const sendResult = await getSendResult(result.taskId);
      console.log('发送结果:', JSON.stringify(sendResult, null, 2));
    }
  }

  return result;
}

async function testMarkdownMessage() {
  console.log('\n========================================');
  console.log('测试 2: 发送 Markdown 格式消息');
  console.log('========================================\n');

  const content = `### Markdown 格式测试消息

这是一条 **Markdown** 格式的测试消息。

- 测试项 1: 正常 ✅
- 测试项 2: 正常 ✅
- 测试项 3: 正常 ✅

测试时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

---
点击查看详情: https://xly.gzzxd.com`;

  const result = await sendWorkNotification(
    [TEST_USER_ID],
    '【测试通知】Markdown 格式测试',
    content,
    {
      msgType: 'markdown',
      businessType: 'collection',
      businessNo: 'TEST-002',
    }
  );

  console.log('发送结果:', JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  console.log('========================================');
  console.log('钉钉工作通知功能测试');
  console.log('测试用户: 文昌盛');
  console.log('钉钉ID:', TEST_USER_ID);
  console.log('测试时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  console.log('========================================');

  try {
    // 测试 1: ActionCard 格式
    const result1 = await testActionCardMessage();

    // 等待一下再发送第二条
    console.log('\n等待 5 秒后发送第二条测试消息...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 测试 2: Markdown 格式
    const result2 = await testMarkdownMessage();

    console.log('\n========================================');
    console.log('测试完成！');
    console.log('========================================');
    console.log('ActionCard 消息:', result1.success ? '✅ 成功' : '❌ 失败');
    console.log('Markdown 消息:', result2.success ? '✅ 成功' : '❌ 失败');

    if (!result1.success) {
      console.log('ActionCard 失败原因:', result1.message);
    }
    if (!result2.success) {
      console.log('Markdown 失败原因:', result2.message);
    }

  } catch (error) {
    console.error('测试失败:', error);
  }

  process.exit(0);
}

main();
