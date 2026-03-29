/**
 * 考核规则说明组件
 */
import React, { useState, useEffect } from 'react';
import { Collapse, Card, Button, Modal } from 'antd';
import { InfoCircleOutlined, CloseOutlined } from '@ant-design/icons';
import styles from '../index.less';

const PenaltyRules: React.FC = () => {
  // 是否移动端
  const [isMobile, setIsMobile] = useState(false);
  // 移动端弹窗显示状态
  const [modalVisible, setModalVisible] = useState(false);

  // 检测屏幕宽度
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 考核规则数据
  const rulesData = [
    {
      title: '营销师/财务',
      rules: [
        { condition: '超时3天内', penalty: '无考核', highlight: false },
        { condition: '超时3-4天', penalty: '10元/单', highlight: false },
        { condition: '超时4-7天', penalty: '20元/单', highlight: false },
        { condition: '超时7天以上', penalty: '按欠款金额全额考核', highlight: true },
      ],
    },
    {
      title: '营销主管',
      rules: [
        { condition: '超时3天内', penalty: '无考核', highlight: false },
        { condition: '超时3-4天', penalty: '50元/单', highlight: false },
        { condition: '超时4-7天', penalty: '100元/单', highlight: false },
        { condition: '超时7天以上', penalty: '按欠款金额全额考核', highlight: true },
      ],
    },
  ];

  // 渲染规则内容
  const renderRulesContent = () => (
    <div className={styles.rulesContent}>
      {rulesData.map((section, index) => (
        <div key={index} className={styles.ruleSection}>
          <div className={styles.ruleTitle}>{section.title}</div>
          <div className={styles.ruleList}>
            {section.rules.map((rule, ruleIndex) => (
              <div key={ruleIndex} className={styles.ruleItem}>
                <span className={styles.ruleCondition}>{rule.condition}</span>
                <span
                  className={`${styles.rulePenalty} ${rule.highlight ? styles.highlight : ''}`}
                >
                  {rule.penalty}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // 桌面端折叠面板
  const renderDesktopRules = () => (
    <Card className={styles.rulesCard}>
      <Collapse
        defaultActiveKey={[]}
        items={[
          {
            key: '1',
            label: (
              <span style={{ fontWeight: 500 }}>
                <InfoCircleOutlined style={{ marginRight: 8 }} />
                考核规则说明
              </span>
            ),
            children: renderRulesContent(),
          },
        ]}
      />
    </Card>
  );

  // 移动端悬浮按钮 + 弹窗
  const renderMobileRules = () => (
    <>
      {/* 悬浮按钮 */}
      <Button
        type="primary"
        shape="circle"
        icon={<InfoCircleOutlined />}
        className={styles.mobileRulesBtn}
        onClick={() => setModalVisible(true)}
      />

      {/* 规则弹窗 */}
      <Modal
        title="考核规则说明"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        closeIcon={<CloseOutlined />}
      >
        {renderRulesContent()}
      </Modal>
    </>
  );

  return isMobile ? renderMobileRules() : renderDesktopRules();
};

export default PenaltyRules;
