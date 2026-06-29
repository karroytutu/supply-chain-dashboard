/**
 * 考核规则说明组件
 */
import React from 'react';
import { Card, Typography } from 'antd';

const { Paragraph } = Typography;

interface RulesDescriptionProps {
  category: AssessmentCategory;
}

/** 退货考核规则说明 */
const RETURN_RULES_CONTENT = [
  '1. 采购确认超时：10元/天/SKU',
  '2. 营销销售超时：按进价全额',
  '3. 退货保质期不足：按进价全额',
  '4. ERP录入超时：10元/天/SKU',
  '5. 仓储执行超时：10元/天/SKU',
];

const RulesDescription: React.FC<RulesDescriptionProps> = ({ category }) => {
  const rules = RETURN_RULES_CONTENT;
  const title = '退货考核规则';

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
