/**
 * 快捷入口组件
 */

import React from 'react';
import { Card, Row, Col, Button } from 'antd';
import { ShoppingOutlined, StarOutlined } from '@ant-design/icons';
import { history } from 'umi';
import styles from './QuickLinksCard.less';

const QuickLinksCard: React.FC = () => (
  <Card title="快捷入口" className={styles.quickLinksCard}>
    <Row gutter={16}>
      <Col xs={24} sm={12} md={8}>
        <Button
          type="dashed"
          block
          className={styles.quickLinkBtn}
          icon={<ShoppingOutlined />}
          onClick={() => history.push('/procurement')}
        >
          采购数据管理
        </Button>
      </Col>
      <Col xs={24} sm={12} md={8}>
        <Button
          type="dashed"
          block
          className={styles.quickLinkBtn}
          icon={<StarOutlined />}
          onClick={() => history.push('/procurement/strategic-products')}
        >
          战略商品管理
        </Button>
      </Col>
    </Row>
  </Card>
);

export default QuickLinksCard;
