/**
 * 退货考核管理页面
 */
import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, DatePicker, Select, Input, Row, Col, Statistic, Modal, message } from 'antd';
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getReturnPenalties, getReturnPenaltyStats, confirmReturnPenalty, cancelReturnPenalty } from '@/services/api/return-penalty';
import type { PenaltyRecord, PenaltyStats, PenaltyType, PenaltyStatus, PenaltyRole } from '@/types/return-penalty.d';
import { PENALTY_TYPE_NAMES, PENALTY_STATUS_NAMES, PENALTY_ROLE_NAMES } from '@/types/return-penalty.d';
import styles from './index.less';

const { RangePicker } = DatePicker;
const { Option } = Select;

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
          page,
          pageSize,
          penaltyType,
          status,
          keyword,
          startDate: dateRange?.[0],
          endDate: dateRange?.[1],
        }),
        getReturnPenaltyStats(),
      ]);
      setData(listResult.list);
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

  // 表格列定义
  const columns: ColumnsType<PenaltyRecord> = [
    {
      title: '退货单号',
      dataIndex: 'returnNo',
      width: 140,
      render: (text) => text || '-',
    },
    {
      title: '商品名称',
      dataIndex: 'goodsName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '被考核人',
      dataIndex: 'penaltyUserName',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'penaltyRole',
      width: 100,
      render: (role: PenaltyRole) => PENALTY_ROLE_NAMES[role] || role,
    },
    {
      title: '考核类型',
      dataIndex: 'penaltyType',
      width: 130,
      render: (type: PenaltyType) => (
        <Tag color="blue">{PENALTY_TYPE_NAMES[type] || type}</Tag>
      ),
    },
    {
      title: '超时天数',
      dataIndex: 'overdueDays',
      width: 90,
      align: 'center',
      render: (days) => days > 0 ? `${days}天` : '-',
    },
    {
      title: '考核金额',
      dataIndex: 'penaltyAmount',
      width: 100,
      align: 'right',
      render: (amount) => <span style={{ color: '#f5222d' }}>¥{amount.toFixed(2)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: PenaltyStatus) => {
        const colorMap: Record<PenaltyStatus, string> = {
          pending: 'orange',
          confirmed: 'green',
          appealed: 'blue',
          cancelled: 'default',
        };
        return <Tag color={colorMap[status]}>{PENALTY_STATUS_NAMES[status] || status}</Tag>;
      },
    },
    {
      title: '计算时间',
      dataIndex: 'calculatedAt',
      width: 160,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        if (record.status !== 'pending') return '-';
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleConfirm(record.id)}
            >
              确认
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => handleCancel(record.id)}
            >
              取消
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div className={styles.container}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic title="总考核金额" value={stats?.totalAmount || 0} prefix="¥" precision={2} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="待确认" value={stats?.pendingCount || 0} suffix="条" />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="待确认金额" value={stats?.pendingAmount || 0} prefix="¥" precision={2} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="已确认" value={stats?.confirmedCount || 0} suffix="条" />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="今日新增" value={stats?.todayCount || 0} suffix="条" />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="涉及人数" value={stats?.userCount || 0} suffix="人" />
          </Card>
        </Col>
      </Row>

      {/* 筛选区域 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索单号/商品/人员"
            style={{ width: 200 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => setKeyword(v)}
            allowClear
          />
          <Select
            placeholder="考核类型"
            style={{ width: 150 }}
            value={penaltyType}
            onChange={setPenaltyType}
            allowClear
          >
            {Object.entries(PENALTY_TYPE_NAMES).map(([key, name]) => (
              <Option key={key} value={key}>{name}</Option>
            ))}
          </Select>
          <Select
            placeholder="状态"
            style={{ width: 120 }}
            value={status}
            onChange={setStatus}
            allowClear
          >
            {Object.entries(PENALTY_STATUS_NAMES).map(([key, name]) => (
              <Option key={key} value={key}>{name}</Option>
            ))}
          </Select>
          <RangePicker
            onChange={(_, dateStrings) => {
              if (dateStrings[0] && dateStrings[1]) {
                setDateRange([dateStrings[0], dateStrings[1]]);
              } else {
                setDateRange(undefined);
              }
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* 考核规则说明 */}
      <Card title="考核规则说明" style={{ marginTop: 16 }}>
        <div className={styles.rules}>
          <p><strong>1. 采购确认超时考核：</strong>退货单创建后，采购主管未在当天确认规则，每延迟1天考核10元</p>
          <p><strong>2. 营销未完成销售考核：</strong>无法采购退货的商品过期前未清仓，按商品进价考核营销师</p>
          <p><strong>3. 退货时保质期不足考核：</strong>退货时剩余保质期低于15天，按商品进价考核营销师</p>
          <p><strong>4. ERP录入超时考核：</strong>采购确认后30天内未录入ERP，每延迟1天考核10元</p>
          <p><strong>5. 仓储执行超时考核：</strong>ERP录入后7天内未执行退货，每延迟1天，每条商品记录考核10元（考核对象：仓储主管、库管员、物流主管）</p>
        </div>
      </Card>
    </div>
  );
};

export default PenaltyPage;
