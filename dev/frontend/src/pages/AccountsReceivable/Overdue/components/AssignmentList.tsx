/**
 * 待分配列表
 * 展示待营销主管分配的逾期任务列表
 */
import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  message,
  Row,
  Col,
} from 'antd';
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import type { OverdueTaskItem, OverdueLevel, ArPaginatedResult } from '@/types/accounts-receivable';
import { getAssignmentList } from '@/services/api/accounts-receivable';
import { PERMISSIONS } from '@/constants/permissions';
import { usePermission } from '@/hooks/usePermission';
import AssignmentModal from './AssignmentModal';
import styles from '../index.less';

const { Option } = Select;

interface AssignmentListProps {
  onRefreshStats: () => void;
}

const levelColors: Record<OverdueLevel, string> = {
  light: 'green',
  medium: 'orange',
  severe: 'red',
};

const levelLabels: Record<OverdueLevel, string> = {
  light: '轻度',
  medium: '中度',
  severe: '重度',
};

const AssignmentList: React.FC<AssignmentListProps> = ({ onRefreshStats }) => {
  const { hasPermission } = usePermission();
  const [data, setData] = useState<OverdueTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [overdueLevel, setOverdueLevel] = useState<OverdueLevel | undefined>();
  const [selectedRows, setSelectedRows] = useState<OverdueTaskItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTask, setModalTask] = useState<OverdueTaskItem | null>(null);

  const canAssign = hasPermission(PERMISSIONS.FINANCE.AR.OVERDUE.ASSIGN);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result: ArPaginatedResult<OverdueTaskItem> = await getAssignmentList({
        page,
        pageSize,
        keyword: keyword || undefined,
        overdueLevel,
      });
      setData(result.list);
      setTotal(result.total);
    } catch (error) {
      message.error('获取待分配列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, keyword, overdueLevel]);

  const handleAssign = (record: OverdueTaskItem) => {
    setModalTask(record);
    setModalVisible(true);
  };

  const handleModalSuccess = () => {
    setModalVisible(false);
    fetchData();
    onRefreshStats();
  };

  const columns = [
    {
      title: '任务编号',
      dataIndex: 'taskNo',
      key: 'taskNo',
      width: 140,
    },
    {
      title: '客户名称',
      dataIndex: 'consumerName',
      key: 'consumerName',
      width: 180,
    },
    {
      title: '逾期等级',
      dataIndex: 'overdueLevel',
      key: 'overdueLevel',
      width: 100,
      render: (level: OverdueLevel) => (
        <Tag color={levelColors[level]}>{levelLabels[level]}</Tag>
      ),
    },
    {
      title: '单据数',
      dataIndex: 'billCount',
      key: 'billCount',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => `¥${amount.toLocaleString()}`,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: OverdueTaskItem) => (
        <Space>
          {canAssign && (
            <Button
              type="primary"
              size="small"
              icon={<UserAddOutlined />}
              onClick={() => handleAssign(record)}
            >
              分配任务
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys: selectedRows.map((r) => r.id),
    onChange: (_: React.Key[], selected: OverdueTaskItem[]) => {
      setSelectedRows(selected);
    },
  };

  return (
    <div className={styles.listContainer}>
      <div className={styles.filterSection}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="搜索客户名称/任务编号"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              placeholder="逾期等级"
              allowClear
              style={{ width: '100%' }}
              value={overdueLevel}
              onChange={setOverdueLevel}
            >
              <Option value="light">轻度</Option>
              <Option value="medium">中度</Option>
              <Option value="severe">重度</Option>
            </Select>
          </Col>
          <Col xs={24} sm={24} md={10} style={{ textAlign: 'right' }}>
            {selectedRows.length > 0 && canAssign && (
              <Button type="primary">
                批量分配 ({selectedRows.length})
              </Button>
            )}
          </Col>
        </Row>
      </div>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            if (ps) setPageSize(ps);
          },
        }}
        scroll={{ x: 900 }}
      />

      <AssignmentModal
        visible={modalVisible}
        task={modalTask}
        onCancel={() => setModalVisible(false)}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
};

export default AssignmentList;
