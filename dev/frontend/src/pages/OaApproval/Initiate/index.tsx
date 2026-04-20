/**
 * 发起审批页面 - 卡片网格布局 + 分类 Tab 筛选
 */
import React, { useState, useEffect, useMemo } from 'react';
import { history } from 'umi';
import { Spin, Empty, Button } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { FormTypeDefinition, FormCategory, CATEGORY_LABELS } from '@/types/oa-approval';
import { useRecentForms, QuickAccessItem } from '../hooks/useRecentForms';
import { CATEGORY_COLORS } from './constants';
import CategoryTabs, { ActiveCategory } from './components/CategoryTabs';
import FormCard from './components/FormCard';
import styles from './index.less';

const Initiate: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [formTypesGrouped, setFormTypesGrouped] = useState<Record<FormCategory, FormTypeDefinition[]> | null>(null);
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>('all');
  const { quickAccessItems, recordUsage } = useRecentForms();

  useEffect(() => {
    loadFormTypes();
  }, []);

  const loadFormTypes = async () => {
    setLoading(true);
    try {
      const res = await oaApprovalApi.getFormTypesGrouped();
      setFormTypesGrouped(res.data);
    } catch (error) {
      console.error('加载表单类型失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /** 各分类数量统计 */
  const categoryCounts = useMemo<Record<FormCategory, number>>(() => {
    const counts: Record<FormCategory, number> = {
      finance: 0, supply_chain: 0, marketing: 0, hr: 0, admin: 0,
    };
    if (formTypesGrouped) {
      for (const cat of Object.keys(formTypesGrouped) as FormCategory[]) {
        counts[cat] = formTypesGrouped[cat].length;
      }
    }
    return counts;
  }, [formTypesGrouped]);

  /** 按搜索 + Tab 分类筛选 */
  const filteredFormTypes = useMemo(() => {
    if (!formTypesGrouped) return null;

    const result: Record<FormCategory, FormTypeDefinition[]> = {
      finance: [], supply_chain: [], marketing: [], hr: [], admin: [],
    };
    const keyword = searchText.toLowerCase().trim();

    for (const category of Object.keys(formTypesGrouped) as FormCategory[]) {
      if (activeCategory !== 'all' && category !== activeCategory) continue;

      let items = formTypesGrouped[category];
      if (keyword) {
        items = items.filter(
          (ft) => ft.name.toLowerCase().includes(keyword) || ft.description.toLowerCase().includes(keyword),
        );
      }
      result[category] = items;
    }
    return result;
  }, [formTypesGrouped, searchText, activeCategory]);

  /** 点击表单卡片 */
  const handleFormClick = (formType: FormTypeDefinition) => {
    recordUsage(formType);
    history.push(`/oa/form/${formType.code}`);
  };

  /** 点击最近使用项 */
  const handleRecentClick = (item: QuickAccessItem) => {
    history.push(`/oa/form/${item.code}`);
  };

  /** 渲染分类区域 */
  const renderCategorySection = (category: FormCategory, formTypes: FormTypeDefinition[], showHeader: boolean) => {
    if (formTypes.length === 0) return null;

    return (
      <div key={category} className={styles.categorySection}>
        {showHeader && (
          <div className={styles.sectionHeader}>
            <span
              className={styles.sectionDot}
              style={{ backgroundColor: CATEGORY_COLORS[category] }}
            />
            <span className={styles.sectionName}>{CATEGORY_LABELS[category]}</span>
            <span className={styles.sectionCount}>{formTypes.length}</span>
          </div>
        )}
        <div className={styles.cardGrid}>
          {formTypes.map((ft) => (
            <FormCard
              key={ft.code}
              name={ft.name}
              category={category}
              onClick={() => handleFormClick(ft)}
            />
          ))}
        </div>
      </div>
    );
  };

  /** 渲染最近使用区域（与分类区域同样的样式） */
  const renderRecentSection = () => {
    if (quickAccessItems.length === 0) return null;

    return (
      <div className={styles.categorySection}>
        <div className={styles.sectionHeader}>
          <ClockCircleOutlined className={styles.sectionIcon} />
          <span className={styles.sectionName}>最近使用</span>
          <span className={styles.sectionCount}>{quickAccessItems.length}</span>
        </div>
        <div className={styles.cardGrid}>
          {quickAccessItems.map((item) => (
            <FormCard
              key={item.code}
              name={item.name}
              category={item.category}
              onClick={() => handleRecentClick(item)}
            />
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  const hasResults = filteredFormTypes && Object.values(filteredFormTypes).some((arr) => arr.length > 0);
  const hasRecent = quickAccessItems.length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>发起审批</h1>
      </div>

      <CategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        categoryCounts={categoryCounts}
        searchText={searchText}
        onSearchChange={setSearchText}
      />

      <div className={styles.content}>
        {!hasResults && !hasRecent ? (
          <div className={styles.emptyState}>
            <Empty description="未找到相关表单类型" image={Empty.PRESENTED_IMAGE_SIMPLE}>
              {searchText && (
                <Button type="link" onClick={() => setSearchText('')}>清除搜索</Button>
              )}
            </Empty>
          </div>
        ) : (
          <>
            {renderRecentSection()}
            {Object.entries(filteredFormTypes!).map(([category, formTypes]) =>
              renderCategorySection(
                category as FormCategory,
                formTypes,
                activeCategory === 'all',
              ),
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Initiate;
