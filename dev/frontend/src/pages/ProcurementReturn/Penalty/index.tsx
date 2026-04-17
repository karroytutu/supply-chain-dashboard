/**
 * 退货考核管理页面
 */
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Modal, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { getReturnPenalties, getReturnPenaltyStats, confirmReturnPenalty, cancelReturnPenalty } from '@/services/api/return-penalty';
import type { PenaltyRecord, PenaltyStats, PenaltyType, PenaltyStatus } from '@/types/return-penalty.d';
import PenaltyTable from './components/PenaltyTable';
import PenaltyFilter from './components/PenaltyFilter';
import styles from './index.less';

const PenaltyPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PenaltyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [stats, setStats] = useState<PenaltyStats | null>(null);

  // 筛选条件
  const [penaltyType, setPenaltyType] = useState<PenaltyType | undefined>();
  const [status, setStatus] = useState<PenaltyStatus | undefined>();
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [listResult, statsResult] = await Promise.all([
        getReturnPenalties({
          page, pageSize, penaltyType, status, keyword,
          startDate: dateRange?.[0], endDate: dateRange?.[1],
        }),
        getReturnPenaltyStats(),
      ]);
      setData(listResult.data);
      setTotal(listResult.total);
      setStats(statsResult);
    } catch (error) {
      console.error('加载考核数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize, penaltyType, status, keyword, dateRange]);

  // 确认考核
  const handleConfirm = async (id: number) => {
    Modal.confirm({
      title: '确认考核',
      icon: <ExclamationCircleOutlined />,
      content: '确认后将记录考核金额，确定要确认吗？',
      onOk: async () => {
        try {
          await confirmReturnPenalty(id);
          message.success('考核已确认');
          loadData();
        } catch (error) {
          message.error('确认失败');
        }
      },
    });
  };

  // 取消考核
  const handleCancel = async (id: number) => {
    Modal.confirm({
      title: '取消考核',
      icon: <ExclamationCircleOutlined />,
      content: '取消后将不再对该记录进行考核，确定要取消吗？',
      onOk: async () => {
        try {
          await cancelReturnPenalty(id);
          message.success('考核已取消');
          loadData();
        } catch (error) {
          message.error('取消失败');
        }
      },
    });
  };

  return (
    <div className={styles.container}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card><Statistic title="总考核金额" value={stats?.totalAmount || 0} prefix="¥" precision={2} /></Card></Col>
        <Col span={4}><Card><Statistic title="待确认" value={stats?.pendingCount || 0} suffix="条" /></Card></Col>
        <Col span={4}><Card><Statistic title="待确认金额" value={stats?.pendingAmount || 0} prefix="¥" precision={2} /></Card></Col>
        <Col span={4}><Card><Statistic title="已确认" value={stats?.confirmedCount || 0} suffix="条" /></Card></Col>
        <Col span={4}><Card><Statistic title="今日新增" value={stats?.todayCount || 0} suffix="条" /></Card></Col>
        <Col span={4}><Card><Statistic title="涉及人数" value={stats?.userCount || 0} suffix="人" /></Card></Col>
      </Row>

      {/* 筛选区域 */}
      <PenaltyFilter
        keyword={keyword}
        penaltyType={penaltyType}
        status={status}
        onKeywordChange={setKeyword}
        onPenaltyTypeChange={setPenaltyType}
        onStatusChange={setStatus}
        onDateRangeChange={setDateRange}
        onRefresh={loadData}
      />

      {/* 数据表格 */}
      <Card>
        <PenaltyTable
          data={data}
          loading={loading}
          page={page}
          pageSize={pageSize}
          total={total}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onPageChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        />
      </Card>

      {/* 考核规则说明 */}
      <Card title="考核规则说明" style={{ marginTop: 16 }}>
        <div className={styles.rules}>
          <p><strong>1. 采购确认超时考核：</strong>退货单创建后，采购主管未在当天确认规则，超时期间按 10元/天/SKU 累计考核</p>
          <p><strong>2. 营销未完成销售考核：</strong>无法采购退货的商品过期前未清仓，按商品进价全额考核营销师</p>
          <p><strong>3. 退货时保质期不足考核：</strong>退货时剩余保质期低于15天，按商品进价全额考核营销师</p>
          <p><strong>4. ERP录入超时考核：</strong>采购确认后30天内未录入ERP，超时期间按 10元/天/SKU 累计考核</p>
          <p><strong>5. 仓储执行超时考核：</strong>ERP录入后7天内未执行退货，超时期间按 10元/天/SKU 累计考核（考核对象：仓储主管、库管员、物流主管）</p>
        </div>
      </Card>
    </div>
  );
};

export default PenaltyPage;
