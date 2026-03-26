import React, { useState, useEffect } from 'react';
import { Table, Input, Spin, Empty, Button } from 'antd';
import { LeftOutlined, SearchOutlined } from '@ant-design/icons';
import { getCategoryOutOfStockProducts } from '@/services/api/dashboard';
import type { OutOfStockProductSimple } from '@/types/warning';
import styles from './index.less';

interface ProductListProps {
  categoryPath: string;
  categoryName: string;
  onBack: () => void;
  isDrawerMode?: boolean;
}

const ProductList: React.FC<ProductListProps> = ({
  categoryPath,
  categoryName,
  onBack,
  isDrawerMode = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OutOfStockProductSimple[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadData(1, pageSize);
  }, [categoryPath]);

  const loadData = async (p: number, ps: number) => {
    setLoading(true);
    try {
      const result = await getCategoryOutOfStockProducts(categoryPath, {
        page: p,
        pageSize: ps,
      });
      // result 是分页结果，确保 data 是数组
      const productList = Array.isArray(result.data) ? result.data : [];
      setData(productList);
      setTotal(result.total || 0);
      setPage(p);
      setPageSize(ps);
    } catch (error) {
      console.error('获取缺货商品列表失败:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = searchText
    ? data.filter((item) =>
        item.productName.toLowerCase().includes(searchText.toLowerCase())
      )
    : data;

  const columns = [
    {
      title: '商品名称',
      dataIndex: 'productName',
      key: 'productName',
      render: (text: string) => <span className={styles.productName}>{text}</span>,
    },
  ];

  return (
    <div className={styles.productList}>
      <div className={styles.listHeader}>
        <div className={styles.listTitle}>
          {!isDrawerMode && (
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={onBack}
              className={styles.backBtn}
            />
          )}
          {isDrawerMode ? (
            <>
              <span className={styles.categoryTag}>"{categoryName}"</span>
              <span className={styles.totalCount}>共 {total} 件缺货商品</span>
            </>
          ) : (
            <>
              缺货商品明细
              <span className={styles.categoryTag}>"{categoryName}"</span>
              <span className={styles.totalCount}>共 {total} 件</span>
            </>
          )}
        </div>
        <Input
          placeholder="搜索商品名称"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={styles.searchInput}
          allowClear
        />
      </div>
      
      {loading ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : data.length === 0 ? (
        <Empty description="暂无缺货商品" />
      ) : (
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="productName"
          pagination={{
            current: page,
            pageSize,
            total: searchText ? filteredData.length : total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              if (!searchText) {
                loadData(p, ps);
              }
            },
          }}
          size="small"
          className={styles.table}
        />
      )}
    </div>
  );
};

export default ProductList;
