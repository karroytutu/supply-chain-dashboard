/**
 * 页面头部
 * 包含标题、描述和周期筛选器
 */

import React from 'react';
import { Segmented, Tag } from 'antd';
import { PERIOD_OPTIONS } from '@/constants/salesAnalysis';
import styles from './PageHeader.less';

const PageHeader: React.FC = () => {
  return (
    <section className={styles.header}>
      <div className={styles.headerTop}>
        <div>
          <h1 className={styles.title}>首页总览原型</h1>
          <p className={styles.desc}>
            当前页面采用更接近 Ant Design 默认后台的视觉风格，保留单页查看四大板块的结构，
            重点用于确认首页布局、信息层级、组件质感和图表容器形式。
          </p>
        </div>
      </div>
      <div className={styles.headerBottom}>
        <div className={styles.toolbarLeft}>
          <Segmented
            options={[...PERIOD_OPTIONS]}
            defaultValue="本月"
          />
        </div>
        <div className={styles.toolbarRight}>
          <Tag color="blue">静态原型</Tag>
          <Tag color="green">Ant 风格</Tag>
        </div>
      </div>
    </section>
  );
};

export default PageHeader;
