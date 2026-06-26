/**
 * 表单卡片组件 - 纵向紧凑布局：图标上 + 名称下
 */
import React from 'react';
import type { FormCategory } from '@/types/oa';
import { CATEGORY_ICONS, CATEGORY_COLORS, FORM_ICON_MAP } from '../constants';
import styles from './FormCard.less';

interface FormCardProps {
  name: string;
  icon?: string;
  category: FormCategory;
  onClick: () => void;
}

const FormCard: React.FC<FormCardProps> = ({ name, icon, category, onClick }) => {
  const color = CATEGORY_COLORS[category];
  // 优先使用表单自身图标，未匹配时回退到分类图标
  const iconNode = (icon && FORM_ICON_MAP[icon]) || CATEGORY_ICONS[category];

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
        {iconNode}
      </div>
      <span className={styles.formName}>{name}</span>
    </div>
  );
};

export default FormCard;
