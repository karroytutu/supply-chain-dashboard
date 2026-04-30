/**
 * 考核规则说明组件
 */
import React from 'react';
import { Card, Typography } from 'antd';

const { Paragraph } = Typography;

interface RulesDescriptionProps {
  category: AssessmentCategory;
}

/** 催收考核规则说明 */
const AR_RULES_CONTENT = [
  '1. 一级考核(3-5天)：营销师10元/任务，营销主管20元/任务',
  '2. 二级考核(5-7天)：追加营销师20元/任务，营销主管40元/任务',
  '3. 三级考核(7天以上)：按欠款金额营销师70%、营销主管30%',
  '说明：阶梯累进，延期重置计时器',
  '生效日期：2026-04-23',
];

/** 退货考核规则说明 */
const RETURN_RULES_CONTENT = [
  '1. 采购确认超时：10元/天/SKU',
  '2. 营销销售超时：按进价全额',
  '3. 退货保质期不足：按进价全额',
  '4. ERP录入超时：10元/天/SKU',
  '5. 仓储执行超时：10元/天/SKU',
];

const RulesDescription: React.FC<RulesDescriptionProps> = ({ category }) => {
  const rules = category === 'ar_collection' ? AR_RULES_CONTENT : RETURN_RULES_CONTENT;
  const title = category === 'ar_collection' ? '催收考核规则' : '退货考核规则';

  return (
    <Card title={title} size="small" className="rules-card">
      {rules.map((rule, index) => (
        <Paragraph key={index} style={{ lineHeight: 1.8, marginBottom: 8 }}>
          {rule}
        </Paragraph>
      ))}
    </Card>
  );
};

export default RulesDescription;
