/**
 * 催收进度管道
 * 桌面端：横向流向布局，箭头连接
 * 移动端：纵向列表，左侧竖线连接
 * 每个节点显示即将逾期笔数，点击可查看弹窗
 * 底部展示诉讼进度统计
 */

import React from 'react';
import { Card, Typography, Tag } from 'antd';
import {
  RightOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import useMobileDetect from '@/hooks/useMobileDetect';
import styles from './index.less';

const { Text } = Typography;

/** 角色标签颜色映射 */
const ROLE_TAG_COLOR: Record<PendingRole, string> = {
  marketer: 'blue',
  supervisor: 'orange',
  finance: 'red',
};

/** 角色标签文本映射 */
const ROLE_LABEL: Record<PendingRole, string> = {
  marketer: '营销师',
  supervisor: '营销经理',
  finance: '财务',
};

interface CollectionPipelineProps {
  nodes: PipelineNode[];
  legalProgress: LegalProgressStats;
  activeFilter: PipelineFilter;
  onNodeClick: (node: PipelineNode) => void;
  onExpiryClick: (node: PipelineNode) => void;
}

/** 格式化金额 */
const fmtAmount = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : `${v}`);

const CollectionPipeline: React.FC<CollectionPipelineProps> = ({
  nodes,
  legalProgress,
  activeFilter,
  onNodeClick,
  onExpiryClick,
}) => {
  const isMobile = useMobileDetect();

  const legalTotal =
    legalProgress.noticeSent +
    legalProgress.lawsuitFiled +
    legalProgress.lawsuitInProgress +
    legalProgress.lawsuitCompleted;

  /** 渲染单个节点（桌面端和移动端共用核心内容） */
  const renderNode = (node: PipelineNode, idx: number) => {
    const isActive =
      activeFilter.status === node.status &&
      activeFilter.escalationLevel === node.escalationLevel;
    return (
      <div
        className={`${styles.node} ${isActive ? styles.nodeActive : ''}`}
        style={{ '--node-color': node.color } as React.CSSProperties}
        onClick={() => onNodeClick(node)}
      >
        <Tag color={ROLE_TAG_COLOR[node.pendingRole]} className={styles.roleTag}>
          {ROLE_LABEL[node.pendingRole]}
        </Tag>
        <div className={styles.nodeLabel}>{node.label}</div>
        <div className={styles.nodeCount} style={{ color: node.color }}>
          {node.count}
        </div>
        <div className={styles.nodeAmount}>¥{fmtAmount(node.amount)}</div>
        {node.upcomingExpiryCount !== undefined && node.upcomingExpiryCount > 0 && (
          <div
            className={styles.expiryBadge}
            onClick={(e) => {
              e.stopPropagation();
              onExpiryClick(node);
            }}
          >
            <WarningOutlined /> {node.upcomingExpiryCount}笔即将逾期
          </div>
        )}
      </div>
    );
  };

  return (
    <Card
      title="催收进度"
      bordered={false}
      className={styles.card}
      extra={
        !isMobile && (
          <Text type="secondary">点击节点筛选明细 · 点击橙色标记查看即将逾期</Text>
        )
      }
    >
      {/* 桌面端：横向流向 */}
      {!isMobile && (
        <div className={styles.flow}>
          {nodes.map((node, idx) => (
            <React.Fragment key={`${node.pendingRole}-${idx}`}>
              {renderNode(node, idx)}
              {idx < nodes.length - 1 && (
                <div className={styles.arrow}>
                  <RightOutlined />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 移动端：纵向列表 */}
      {isMobile && (
        <div className={styles.verticalList}>
          {nodes.map((node, idx) => (
            <div
              key={`${node.pendingRole}-${idx}`}
              className={`${styles.verticalItem} ${idx < nodes.length - 1 ? styles.hasLine : ''}`}
            >
              {renderNode(node, idx)}
            </div>
          ))}
        </div>
      )}

      {/* 诉讼进度 */}
      <div className={styles.legalSection}>
        <div className={styles.legalTitle}>
          <FileTextOutlined />
          <span>诉讼进度</span>
          <Tag>{legalTotal} 件</Tag>
        </div>
        <div className={styles.legalSteps}>
          <div className={styles.legalStep}>
            <div className={styles.legalIcon}><FileTextOutlined /></div>
            <div className={styles.legalCount}>{legalProgress.noticeSent}</div>
            <div className={styles.legalLabel}>催收函</div>
          </div>
          {!isMobile && <div className={styles.legalArrow}><RightOutlined /></div>}
          <div className={styles.legalStep}>
            <div className={styles.legalIcon}><ThunderboltOutlined /></div>
            <div className={styles.legalCount}>{legalProgress.lawsuitFiled}</div>
            <div className={styles.legalLabel}>已起诉</div>
          </div>
          {!isMobile && <div className={styles.legalArrow}><RightOutlined /></div>}
          <div className={styles.legalStep}>
            <div className={styles.legalIcon}><AuditOutlined /></div>
            <div className={styles.legalCount}>{legalProgress.lawsuitInProgress}</div>
            <div className={styles.legalLabel}>诉讼中</div>
          </div>
          {!isMobile && <div className={styles.legalArrow}><RightOutlined /></div>}
          <div className={styles.legalStep}>
            <div className={styles.legalIcon}><CheckCircleOutlined /></div>
            <div className={styles.legalCount}>{legalProgress.lawsuitCompleted}</div>
            <div className={styles.legalLabel}>已判决</div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default CollectionPipeline;
