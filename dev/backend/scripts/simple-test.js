/**
 * 简单的钉钉推送测试
 * 发送给文昌盛
 */

// 使用 require 方式 - 从编译后的 dist 目录加载
const { sendWorkNotification } = require('/root/.qoder/worktree/supply-chain-dashboard/1FtVhO/prod/backend/dist/services/dingtalk.service');

async function test() {
  const userId = 'wm2c3iSFB6udbEBhhCGKIMQiEiE';
  const title = '【测试通知】钉钉推送功能测试';
  const content = `### 测试消息

这是一条测试消息，用于验证钉钉推送功能是否正常工作。

测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

---
点击查看详情: https://xly.gzzxd.com`;

  console.log('========================================');
  console.log('钉钉推送测试');
  console.log('测试用户: 文昌盛');
  console.log('钉钉ID:', userId);
  console.log('========================================\n');

  try {
    const result = await sendWorkNotification([userId], title, content);
    console.log('\n发送结果:', result);
    
    if (result.success) {
      console.log('\n✅ 推送发送成功！请检查钉钉工作通知。');
    } else {
      console.log('\n❌ 推送发送失败:', result.message);
    }
  } catch (error) {
    console.error('测试失败:', error);
  }

  process.exit(0);
}

test();
