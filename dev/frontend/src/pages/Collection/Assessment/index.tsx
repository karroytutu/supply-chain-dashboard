/**
 * 催收考核管理页面
 */
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, message } from 'antd';
import { getArAssessments, getArAssessmentStats, handleArAssessment } from '@/services/api/ar-assessment';
import type { AssessmentRecord, AssessmentStats, AssessmentTier, AssessmentRole, AssessmentStatus } from '@/types/ar-assessment.d';
import AssessmentTable from './components/AssessmentTable';
import AssessmentFilter from './components/AssessmentFilter';
import HandleAssessmentModal from './components/HandleAssessmentModal';
import styles from './index.less';

const AssessmentPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssessmentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [stats, setStats] = useState<AssessmentStats | null>(null);

  // 筛选条件
  const [assessmentTier, setAssessmentTier] = useState<AssessmentTier | undefined>();
  const [assessmentRole, setAssessmentRole] = useState<AssessmentRole | undefined>();
  const [status, setStatus] = useState<AssessmentStatus | undefined>();
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();

  // 标记弹窗状态
  const [markModalVisible, setMarkModalVisible] = useState(false);
  const [markingRecord, setMarkingRecord] = useState<AssessmentRecord | null>(null);

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [listResult, statsResult] = await Promise.all([
        getArAssessments({
          page, pageSize, assessmentTier, assessmentRole, status, keyword,
          startDate: dateRange?.[0], endDate: dateRange?.[1],
        }),
        getArAssessmentStats(),
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
  }, [page, pageSize, assessmentTier, assessmentRole, status, keyword, dateRange]);

  // 打开标记弹窗
  const handleOpenMarkModal = (record: AssessmentRecord) => {
    setMarkingRecord(record);
    setMarkModalVisible(true);
  };

  // 提交标记
  const handleMarkSubmit = async (values: { status: 'handled' | 'skipped'; remark: string }) => {
    if (!markingRecord) return;
    try {
      await handleArAssessment(markingRecord.id, {
        status: values.status,
        remark: values.remark,
      });
      const msg = values.status === 'handled' ? '已标记为已处理' : '已标记为无需处理';
      message.success(msg);
      setMarkModalVisible(false);
      setMarkingRecord(null);
      loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '标记失败');
    }
  };

  return (
    <div className={styles.container}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card><Statistic title="总考核金额" value={stats?.totalAmount || 0} prefix="¥" precision={2} /></Card></Col>
        <Col span={4}><Card><Statistic title="未标记" value={stats?.pendingCount || 0} suffix="条" /></Card></Col>
        <Col span={4}><Card><Statistic title="未标记金额" value={stats?.pendingAmount || 0} prefix="¥" precision={2} /></Card></Col>
        <Col span={4}><Card><Statistic title="已处理" value={stats?.handledCount || 0} suffix="条" /></Card></Col>
        <Col span={4}><Card><Statistic title="今日新增" value={stats?.todayCount || 0} suffix="条" /></Card></Col>
        <Col span={4}><Card><Statistic title="涉及人数" value={stats?.userCount || 0} suffix="人" /></Card></Col>
      </Row>

      {/* 筛选区域 */}
      <AssessmentFilter
        keyword={keyword}
        assessmentTier={assessmentTier}
        assessmentRole={assessmentRole}
        status={status}
        onKeywordChange={setKeyword}
        onTierChange={setAssessmentTier}
        onRoleChange={setAssessmentRole}
        onStatusChange={setStatus}
        onDateRangeChange={setDateRange}
        onRefresh={loadData}
      />

      {/* 数据表格 */}
      <Card>
        <AssessmentTable
          data={data}
          loading={loading}
          page={page}
          pageSize={pageSize}
          total={total}
          onMark={handleOpenMarkModal}
          onPageChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        />
      </Card>

      {/* 标记弹窗 */}
      <HandleAssessmentModal
        visible={markModalVisible}
        record={markingRecord}
        onCancel={() => { setMarkModalVisible(false); setMarkingRecord(null); }}
        onSubmit={handleMarkSubmit}
      />

      {/* 考核规则说明 */}
      <Card title="考核规则说明" style={{ marginTop: 16 }}>
        <div className={styles.rules}>
          <p><strong>1. 一级考核(3-5天)：</strong>催收任务3天未提交结果，营销师10元/任务、营销主管20元/任务</p>
          <p><strong>2. 二级考核(5-7天)：</strong>5天仍未提交，追加营销师20元/任务、营销主管40元/任务</p>
          <p><strong>3. 三级考核(7天以上)：</strong>7天仍未提交，按欠款金额全额考核，营销师70%、营销主管30%</p>
          <p><strong>说明：</strong>考核按阶梯累进计算，各层级独立产生记录。延期到期后考核计时器重置。考核自2026年4月23日起生效。</p>
        </div>
      </Card>
    </div>
  );
};

export default AssessmentPage;
