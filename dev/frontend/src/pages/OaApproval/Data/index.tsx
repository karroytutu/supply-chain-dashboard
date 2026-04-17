import React from 'react';
import { Card, Row, Col, Statistic, Dropdown, Menu, Button, Badge } from 'antd';
import { DownloadOutlined, BarChartOutlined, FileExcelOutlined, FilePdfOutlined, PrinterOutlined } from '@ant-design/icons';
import { useDataList } from './hooks/useDataList';
import DataFilterBar from './components/DataFilterBar';
import DataTable from './components/DataTable';
import styles from './index.less';

const DataPage: React.FC = () => {
  const {
    formTypeCode, status, dateRange, searchText, applicantName,
    setFormTypeCode, setStatus, setDateRange, setSearchText, setApplicantName,
    loading, dataSource, formTypes, pagination, setPagination,
    stats, handleReset, handleExport,
  } = useDataList();

  // 导出菜单
  const exportMenu = (
    <Menu>
      <Menu.Item key="excel" icon={<FileExcelOutlined />} onClick={() => handleExport('excel')}>
        导出 Excel
      </Menu.Item>
      <Menu.Item key="pdf" icon={<FilePdfOutlined />} onClick={() => handleExport('pdf')}>
        导出 PDF
      </Menu.Item>
      <Menu.Item key="print" icon={<PrinterOutlined />} onClick={() => handleExport('print')}>
        打印
      </Menu.Item>
    </Menu>
  );

  return (
    <div className={styles.dataPage}>
      {/* 统计卡片 */}
      <Row gutter={16} className={styles.statsRow}>
        <Col span={6}>
          <Card><Statistic title="审批总数" value={stats.total} prefix={<BarChartOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="审批中" value={stats.pending} valueStyle={{ color: '#1890ff' }} prefix={<Badge status="processing" />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="已通过" value={stats.approved} valueStyle={{ color: '#52c41a' }} prefix={<Badge status="success" />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="已驳回" value={stats.rejected} valueStyle={{ color: '#ff4d4f' }} prefix={<Badge status="error" />} /></Card>
        </Col>
      </Row>

      {/* 主内容区 */}
      <Card className={styles.mainCard}>
        <DataFilterBar
          formTypeCode={formTypeCode}
          status={status}
          dateRange={dateRange}
          searchText={searchText}
          applicantName={applicantName}
          formTypes={formTypes}
          setFormTypeCode={setFormTypeCode}
          setStatus={setStatus}
          setDateRange={setDateRange}
          setSearchText={setSearchText}
          setApplicantName={setApplicantName}
          handleReset={handleReset}
          exportMenu={
            <Dropdown overlay={exportMenu}>
              <Button type="primary" icon={<DownloadOutlined />}>导出</Button>
            </Dropdown>
          }
        />

        <DataTable
          dataSource={dataSource}
          loading={loading}
          pagination={pagination}
          onPaginationChange={(page, pageSize) => {
            setPagination((prev) => ({ ...prev, current: page, pageSize }));
          }}
        />
      </Card>
    </div>
  );
};

export default DataPage;
