/**
 * 发起审批页面
 */
import React, { useState, useEffect, useMemo } from 'react';
import { history } from 'umi';
import { Input, Card, Row, Col, Spin, Empty } from 'antd';
import {
  PayCircleOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  FileTextOutlined,
  BankOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import {
  FormTypeDefinition,
  FormCategory,
  CATEGORY_LABELS,
} from '@/types/oa-approval';
import styles from './index.less';

// 分类图标映射
const CATEGORY_ICONS: Record<FormCategory, React.ReactNode> = {
  finance: <PayCircleOutlined style={{ fontSize: 32, color: '#faad14' }} />,
  supply_chain: <ShoppingCartOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
  marketing: <TeamOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
  hr: <TeamOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
  admin: <BankOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
};

// 分类颜色映射
const CATEGORY_COLORS: Record<FormCategory, string> = {
  finance: '#faad14',
  supply_chain: '#52c41a',
  marketing: '#eb2f96',
  hr: '#1890ff',
  admin: '#722ed1',
};

const Initiate: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [formTypesGrouped, setFormTypesGrouped] = useState<Record<FormCategory, FormTypeDefinition[]> | null>(null);
  const [searchText, setSearchText] = useState('');

  // 加载表单类型
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

  // 过滤后的表单类型
  const filteredFormTypes = useMemo(() => {
    if (!formTypesGrouped) return null;

    const result: Record<FormCategory, FormTypeDefinition[]> = {
      finance: [],
      supply_chain: [],
      marketing: [],
      hr: [],
      admin: [],
    };

    const keyword = searchText.toLowerCase().trim();
    if (!keyword) {
      return formTypesGrouped;
    }

    for (const category of Object.keys(formTypesGrouped) as FormCategory[]) {
      const filtered = formTypesGrouped[category].filter(
        (ft) =>
          ft.name.toLowerCase().includes(keyword) ||
          ft.description.toLowerCase().includes(keyword)
      );
      result[category] = filtered;
    }

    return result;
  }, [formTypesGrouped, searchText]);

  // 点击表单卡片
  const handleCardClick = (formType: FormTypeDefinition) => {
    history.push(`/oa/form/${formType.code}`);
  };

  // 渲染表单卡片
  const renderFormCard = (formType: FormTypeDefinition, category: FormCategory) => {
    return (
      <Col key={formType.code} xs={12} sm={8} md={6} lg={4} xl={4}>
        <div
          className={styles.card}
          onClick={() => handleCardClick(formType)}
          style={{ borderColor: CATEGORY_COLORS[category] }}
        >
          <div className={styles.iconWrapper}>{CATEGORY_ICONS[category]}</div>
          <div className={styles.title}>{formType.name}</div>
          {formType.description && (
            <div className={styles.description}>{formType.description}</div>
          )}
        </div>
      </Col>
    );
  };

  // 渲染分类区域
  const renderCategorySection = (category: FormCategory, formTypes: FormTypeDefinition[]) => {
    if (formTypes.length === 0) return null;

    return (
      <div key={category} className={styles.categorySection}>
        <div className={styles.categoryHeader}>
          <span
            className={styles.categoryIndicator}
            style={{ backgroundColor: CATEGORY_COLORS[category] }}
          />
          <span className={styles.categoryTitle}>{CATEGORY_LABELS[category]}</span>
        </div>
        <Row gutter={[16, 16]}>{formTypes.map((ft) => renderFormCard(ft, category))}</Row>
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

  // 检查是否有结果
  const hasResults = filteredFormTypes && Object.values(filteredFormTypes).some((arr) => arr.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>发起审批</h1>
        <Input
          className={styles.searchInput}
          placeholder="搜索表单类型..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />
      </div>

      <div className={styles.content}>
        {!hasResults ? (
          <Empty description="未找到相关表单类型" />
        ) : (
          Object.entries(filteredFormTypes!).map(([category, formTypes]) =>
            renderCategorySection(category as FormCategory, formTypes)
          )
        )}
      </div>
    </div>
  );
};

export default Initiate;
