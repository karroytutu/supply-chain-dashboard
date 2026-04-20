/**
 * 表单卡片组件 - 纵向紧凑布局：图标上 + 名称下
 */
import React from 'react';
import type { FormCategory } from '@/types/oa-approval';
import { CATEGORY_ICONS, CATEGORY_COLORS } from '../constants';
import styles from './FormCard.less';

interface FormCardProps {
  name: string;
  category: FormCategory;
  onClick: () => void;
}

const FormCard: React.FC<FormCardProps> = ({ name, category, onClick }) => {
  const color = CATEGORY_COLORS[category];

  return (
    <div
      className={styles.formCard}
      style={{ '--card-color': color } as React.CSSProperties}
      onClick={onClick}
    >
      <div
        className={styles.iconCircle}
        style={{ background: `${color}15`, color }}
      >
        {CATEGORY_ICONS[category]}
      </div>
      <span className={styles.formName}>{name}</span>
    </div>
  );
};

export default FormCard;
