/**
 * 测试逾期前预警推送 - 使用新的合并推送模板
 * 发送给文昌盛进行测试
 */
import { query } from '../src/db/pool';
import { appQuery } from '../src/db/appPool';
import { sendWorkNotification } from '../src/services/dingtalk.service';
import { buildMergedWarningMessage } from '../src/services/ar-collection/ar-collection-notify';

async function testMergedWarningPush() {
  console.log('=== 逾期预警合并推送测试（新模板 → 文昌盛）===\n');

  try {
    // 1. 从ERP查询所有未收款的欠款
    const erpSql = `SELECT "billId", "consumerName", "managerUsers",
      "totalAmount", "leftAmount", "settleMethod",
      "consumerExpireDay", "workTime"
      FROM "客户欠款明细" WHERE "leftAmount"::numeric > 0`;

    const erpResult = await query(erpSql, []);
    const now = new Date();

    // 2. 筛选即将到期的欠款（5天内）
    const upcomingDebts: any[] = [];

    for (const debt of erpResult.rows) {
      const workDate = new Date(debt.workTime);
      const maxDays = debt.settleMethod === 2 ? (debt.consumerExpireDay || 0) : 7;
      const expireDate = new Date(workDate.getTime() + maxDays * 86400000);
      const daysToExpire = Math.ceil((expireDate.getTime() - now.getTime()) / 86400000);

      // 筛选: 未逾期且5天内到期
      if (daysToExpire > 0 && daysToExpire <= 5) {
        upcomingDebts.push({
          ...debt,
          expireDate,
          daysToExpire,
          managerName: debt.managerUsers?.split(',')[0].trim() || '',
        });
      }
    }

    if (upcomingDebts.length === 0) {
      console.log('无即将到期的欠款');
      process.exit(0);
      return;
    }

    console.log(`发现 ${upcomingDebts.length} 条即将到期的欠款\n`);

    // 3. 获取文昌盛的钉钉ID
    const wenchangshengName = '文昌盛';
    const wenchangshengUser = await appQuery(
      `SELECT id, dingtalk_user_id FROM users WHERE name = $1 AND status = 1`,
      [wenchangshengName]
    );

    if (wenchangshengUser.rows.length === 0 || !wenchangshengUser.rows[0].dingtalk_user_id) {
      console.log('未找到文昌盛或其钉钉ID为空');
      process.exit(0);
      return;
    }

    const wenchangshengDingtalkId = wenchangshengUser.rows[0].dingtalk_user_id;
    console.log(`文昌盛钉钉ID: ${wenchangshengDingtalkId}\n`);

    // 4. 使用张丽的数据测试（张丽有最多的即将到期欠款）
    const targetManagerName = '张丽';
    const targetDebts = upcomingDebts.filter((d: any) => d.managerName === targetManagerName);
    console.log(`${targetManagerName}负责的即将到期欠款: ${targetDebts.length} 条\n`);

    if (targetDebts.length === 0) {
      console.log('没有测试数据');
      process.exit(0);
      return;
    }

    // 5. 转换为消息模板所需的格式
    const debtItems = targetDebts.map((d: any) => ({
      erpBillId: d.billId,
      consumerName: d.consumerName,
      leftAmount: Number(d.leftAmount),
      expireDate: d.expireDate.toISOString().slice(0, 10),
      daysToExpire: d.daysToExpire,
      settleMethod: d.settleMethod,
    }));

    // 6. 构建合并消息
    const message = buildMergedWarningMessage({
      managerName: targetManagerName,
      debts: debtItems,
    });

    console.log('=== 新模板推送内容 ===');
    console.log('标题:', message.title);
    console.log('\n正文:\n' + message.content);

    // 7. 发送推送
    console.log('\n=== 发送推送 ===');
    const result = await sendWorkNotification(
      [wenchangshengDingtalkId],
      message.title,
      message.content
    );

    console.log('发送结果:', result);

    if (result.success) {
      console.log('\n✅ 推送发送成功！请文昌盛检查钉钉工作通知。');
    } else {
      console.log('\n❌ 推送发送失败:', result.message);
    }

  } catch (error) {
    console.error('测试失败:', error);
  }

  process.exit(0);
}

testMergedWarningPush();
