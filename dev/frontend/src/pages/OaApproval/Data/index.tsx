import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  DatePicker,
  Select,
  Input,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Dropdown,
  Menu,
  message,
  Tooltip,
  Badge,
} from 'antd';
import {
  DownloadOutlined,
  SearchOutlined,
  ReloadOutlined,
  FilterOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { history } from 'umi';
import type { ApprovalInstance, FormTypeDefinition } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { formatDateTime, formatDate } from '@/utils/format';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import styles from './index.less';

const { RangePicker } = DatePicker;
const { Title } = Typography;
const { Option } = Select;

// 审批状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '审批中' },
  approved: { color: 'success', text: '已通过' },
  rejected: { color: 'error', text: '已驳回' },
  withdrawn: { color: 'default', text: '已撤回' },
  cancelled: { color: 'warning', text: '已取消' },
};

// 紧急程度映射
const urgencyMap: Record<string, { color: string; text: string }> = {
  normal: { color: 'default', text: '普通' },
  urgent: { color: 'warning', text: '紧急' },
  very_urgent: { color: 'error', text: '非常紧急' },
};

const DataPage: React.FC = () => {
  // 筛选状态
  const [formTypeCode, setFormTypeCode] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [searchText, setSearchText] = useState('');
  const [applicantName, setApplicantName] = useState('');

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<ApprovalInstance[]>([]);
  const [formTypes, setFormTypes] = useState<FormTypeDefinition[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  // 统计数据
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  // 加载表单类型
  const loadFormTypes = async () => {
    try {
      const res = await oaApprovalApi.getFormTypes();
      setFormTypes(res.data);
    } catch (error) {
      console.error('加载表单类型失败', error);
    }
  };

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        formTypeCode,
        status,
        applicantName,
        keyword: searchText,
      };

      if (dateRange) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await oaApprovalApi.getDataList(params);
      setDataSource(res.data.list);
      setPagination((prev) => ({ ...prev, total: res.data.total }));
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, formTypeCode, status, applicantName, searchText, dateRange]);

  // 加载统计
  const loadStats = async () => {
    try {
      const res = await oaApprovalApi.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('加载统计失败', error);
    }
  };

  useEffect(() => {
    loadFormTypes();
    loadStats();
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 导出菜单
  const exportMenu = (
    <Menu>
      <Menu.Item
        key="excel"
        icon={<FileExcelOutlined />}
        onClick={() => handleExport('excel')}
      >
        导出 Excel
      </Menu.Item>
      <Menu.Item
        key="pdf"
        icon={<FilePdfOutlined />}
        onClick={() => handleExport('pdf')}
      >
        导出 PDF
      </Menu.Item>
      <Menu.Item
        key="print"
        icon={<PrinterOutlined />}
        onClick={() => handleExport('print')}
      >
        打印
      </Menu.Item>
    </Menu>
  );

  // 导出处理
  const handleExport = async (type: 'excel' | 'pdf' | 'print') => {
    const params = {
      formTypeCode: formTypeCode || undefined,
      status: status || undefined,
      applicantName: applicantName || undefined,
      keyword: searchText || undefined,
      exportType: type,
      startDate: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
      endDate: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
    };

    try {
      message.loading({ content: '正在导出...', key: 'export' });
      const res = await oaApprovalApi.exportData(params);

      if (type === 'print') {
        // 打印模式：打开新窗口
        const printWindow = window.open('', '_blank');
        if (printWindow && res.data.html) {
          printWindow.document.write(res.data.html);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        // 下载文件
        if (res.data.url) {
          window.open(res.data.url, '_blank');
        }
      }
      message.success({ content: '导出成功', key: 'export' });
    } catch (error) {
      message.error({ content: '导出失败', key: 'export' });
    }
  };

  // 重置筛选
  const handleReset = () => {
    setFormTypeCode(undefined);
    setStatus(undefined);
    setDateRange(null);
    setSearchText('');
    setApplicantName('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  // 表格列定义
  const columns: ColumnsType<ApprovalInstance> = [
    {
      title: '编号',
      dataIndex: 'instanceNo',
      key: 'instanceNo',
      width: 180,
      fixed: 'left',
      render: (text, record) => (
        <a onClick={() => history.push(`/oa/detail/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: '申请类型',
      dataIndex: 'formTypeName',
      key: 'formTypeName',
      width: 120,
    },
    {
      title: '申请人',
      dataIndex: 'applicantName',
      key: 'applicantName',
      width: 100,
    },
    {
      title: '申请部门',
      dataIndex: 'applicantDept',
      key: 'applicantDept',
      width: 150,
    },
    {
      title: '申请时间',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      width: 160,
      render: (text) => formatDateTime(text),
      sorter: true,
    },
    {
      title: '紧急程度',
      dataIndex: 'urgency',
      key: 'urgency',
      width: 100,
      render: (urgency) => {
        const config = urgencyMap[urgency] || { color: 'default', text: urgency };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = statusMap[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '当前处理人',
      dataIndex: 'currentApproverName',
      key: 'currentApproverName',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      width: 160,
      render: (text) => (text ? formatDateTime(text) : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => history.push(`/oa/detail/${record.id}`)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.dataPage}>
      {/* 统计卡片 */}
      <Row gutter={16} className={styles.statsRow}>
        <Col span={6}>
          <Card>
            <Statistic
              title="审批总数"
              value={stats.total}
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="审批中"
              value={stats.pending}
              valueStyle={{ color: '#1890ff' }}
              prefix={<Badge status="processing" />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已通过"
              value={stats.approved}
              valueStyle={{ color: '#52c41a' }}
              prefix={<Badge status="success" />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已驳回"
              value={stats.rejected}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<Badge status="error" />}
            />
          </Card>
        </Col>
      </Row>

      {/* 主内容区 */}
      <Card className={styles.mainCard}>
        {/* 筛选区域 */}
        <div className={styles.filterSection}>
          <Row gutter={16}>
            <Col span={4}>
              <Select
                placeholder="申请类型"
                allowClear
                style={{ width: '100%' }}
                value={formTypeCode}
                onChange={setFormTypeCode}
              >
                {formTypes.map((ft) => (
                  <Option key={ft.code} value={ft.code}>
                    {ft.name}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col span={4}>
              <Select
                placeholder="审批状态"
                allowClear
                style={{ width: '100%' }}
                value={status}
                onChange={setStatus}
              >
                <Option value="pending">审批中</Option>
                <Option value="approved">已通过</Option>
                <Option value="rejected">已驳回</Option>
                <Option value="withdrawn">已撤回</Option>
                <Option value="cancelled">已取消</Option>
              </Select>
            </Col>
            <Col span={6}>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                placeholder={['开始日期', '结束日期']}
              />
            </Col>
            <Col span={4}>
              <Input
                placeholder="申请人姓名"
                allowClear
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
              />
            </Col>
            <Col span={4}>
              <Input
                placeholder="搜索关键词"
                prefix={<SearchOutlined />}
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </Col>
            <Col span={2}>
              <Space>
                <Tooltip title="重置">
                  <Button icon={<ReloadOutlined />} onClick={handleReset} />
                </Tooltip>
              </Space>
            </Col>
          </Row>
        </div>

        {/* 工具栏 */}
        <div className={styles.toolbar}>
          <Space>
            <span className={styles.filterTag}>
              <FilterOutlined /> 已筛选
              {formTypeCode && <Tag>{formTypes.find((f) => f.code === formTypeCode)?.name}</Tag>}
              {status && <Tag>{statusMap[status]?.text}</Tag>}
              {dateRange && (
                <Tag>
                  {dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')}
                </Tag>
              )}
            </span>
          </Space>
          <Authorized permission={PERMISSIONS.OA.DATA.EXPORT}>
            <Dropdown overlay={exportMenu}>
              <Button type="primary" icon={<DownloadOutlined />}>
                导出
              </Button>
            </Dropdown>
          </Authorized>
        </div>

        {/* 数据表格 */}
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
            },
          }}
        />
      </Card>
    </div>
  );
};

export default DataPage;
