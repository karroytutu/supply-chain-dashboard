import React, { useState, useCallback, useRef } from 'react';
import { Card, Button, Space, Tabs, Table, Statistic, Row, Col, Modal, Tag, Collapse, message } from 'antd';
import { ArrowRightOutlined, SearchOutlined, ExclamationCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import UserSearchSelect from './components/UserSearchSelect';
import { scanHandoverImpact, executeHandover, getHandoverHistory } from '@/services/api/oa';
import type { HandoverScanResult, HandoverHistoryItem } from '@/types/oa';
import { CATEGORY_LABELS, FormCategory } from '@/types/oa';
import styles from './index.less';

const HandoverPage: React.FC = () => {
  const [sourceUserId, setSourceUserId] = useState<number | undefined>();
  const [targetUserId, setTargetUserId] = useState<number | undefined>();
  const [scanResult, setScanResult] = useState<HandoverScanResult | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<number[]>([]);
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [history, setHistory] = useState<{ list: HandoverHistoryItem[]; total: number }>({ list: [], total: 0 });
  const [historyPage, setHistoryPage] = useState(1);
  const historyLoadedRef = useRef(false);

  // 扫描影响范围
  const handleScan = useCallback(async () => {
    if (!sourceUserId) {
      message.warning('请先选择被交接人');
      return;
    }
    setScanning(true);
    try {
      const result = await scanHandoverImpact(sourceUserId);
      setScanResult(result);
      setSelectedCodes(result.formTypes.map(ft => ft.code));
      setSelectedInstanceIds(result.instances.map(inst => inst.nodeId));
      if (result.summary.formTypeCount === 0 && result.summary.instanceCount === 0) {
        message.info('该用户未被指定为任何流程的审批人，也没有在途审批单');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '扫描失败');
    } finally {
      setScanning(false);
    }
  }, [sourceUserId]);

  // 加载历史
  const loadHistory = useCallback(async (page = 1, pageSize = 10) => {
    try {
      const result = await getHandoverHistory(page, pageSize);
      setHistory(result);
      setHistoryPage(page);
      historyLoadedRef.current = true;
    } catch {
      // 静默失败
    }
  }, []);

  // 执行交接
  const handleExecute = useCallback(() => {
    if (!sourceUserId || !targetUserId) {
      message.warning('请选择被交接人和交接人');
      return;
    }
    if (sourceUserId === targetUserId) {
      message.warning('被交接人和交接人不能是同一人');
      return;
    }

    Modal.confirm({
      title: '确认执行交接',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>将交接 <strong>{selectedCodes.length}</strong> 个流程定义和 <strong>{selectedInstanceIds.length}</strong> 个在途审批单节点。</p>
          <p>此操作不可撤销，请确认。</p>
        </div>
      ),
      okText: '确认交接',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setExecuting(true);
        try {
          const result = await executeHandover({
            sourceUserId,
            targetUserId,
            formTypeCodes: selectedCodes,
            instanceIds: selectedInstanceIds,
            includeInFlightInstances: selectedInstanceIds.length > 0,
          });
          message.success(
            `交接完成！更新了 ${result.instancesUpdated} 个在途审批单`
          );
          setScanResult(null);
          setSelectedCodes([]);
          setSelectedInstanceIds([]);
          loadHistory();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '交接失败');
        } finally {
          setExecuting(false);
        }
      },
    });
  }, [sourceUserId, targetUserId, scanResult, selectedCodes, selectedInstanceIds, loadHistory]);

  // 流程定义表格列
  const formTypeColumns = [
    {
      title: '表单名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (cat: FormCategory) => <Tag>{CATEGORY_LABELS[cat] || cat}</Tag>,
    },
    {
      title: '受影响节点',
      dataIndex: 'affectedNodes',
      key: 'affectedNodes',
      render: (nodes: Array<{ order: number; name: string }>) =>
        nodes.map(n => `${n.name}(节点${n.order})`).join('、'),
    },
  ];

  // 在途实例表格列
  const instanceColumns = [
    { title: '审批编号', dataIndex: 'instanceNo', key: 'instanceNo' },
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '表单类型', dataIndex: 'formTypeName', key: 'formTypeName' },
    { title: '当前节点', dataIndex: 'nodeName', key: 'nodeName' },
  ];

  // 历史记录表格列
  const historyColumns = [
    { title: '交接时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName' },
    { title: '被交接人', dataIndex: 'sourceUserName', key: 'sourceUserName' },
    { title: '交接人', dataIndex: 'targetUserName', key: 'targetUserName' },
    {
      title: '影响范围',
      key: 'scope',
      render: (_: unknown, record: HandoverHistoryItem) => {
        const instanceCount = record.affectedInstanceIds?.length ?? 0;
        return `${record.instancesUpdated}个审批单${instanceCount > 0 ? `（含${instanceCount}个实例）` : ''}`;
      },
    },
  ];

  const canExecute = scanResult && (selectedCodes.length > 0 || selectedInstanceIds.length > 0) && targetUserId && sourceUserId !== targetUserId;

  return (
    <div className={`page-scroll ${styles.handoverPage}`}>
      {/* 操作区 */}
      <Card title="流程交接" className={styles.operationCard}>
        <Space size="large" align="end" wrap>
          <div>
            <div className={styles.fieldLabel}>被交接人</div>
            <UserSearchSelect
              value={sourceUserId}
              onChange={(id) => {
                setSourceUserId(id);
                setScanResult(null);
                setSelectedCodes([]);
                setSelectedInstanceIds([]);
              }}
              placeholder="搜索被交接人"
              style={{ width: 200 }}
            />
          </div>
          <ArrowRightOutlined style={{ fontSize: 20, color: '#999', marginBottom: 8 }} />
          <div>
            <div className={styles.fieldLabel}>交接人</div>
            <UserSearchSelect
              value={targetUserId}
              onChange={setTargetUserId}
              placeholder="搜索交接人"
              style={{ width: 200 }}
            />
          </div>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} loading={scanning} onClick={handleScan} disabled={!sourceUserId}>
              扫描影响范围
            </Button>
            <Button type="primary" danger loading={executing} onClick={handleExecute} disabled={!canExecute}>
              执行交接
            </Button>
          </Space>
        </Space>
      </Card>

      {/* 扫描结果 */}
      {scanResult && (
        <Card className={styles.resultCard}>
          <Row gutter={16} className={styles.statsRow}>
            <Col span={8}>
              <Statistic title="受影响表单" value={scanResult.summary.formTypeCount} suffix="个" />
            </Col>
            <Col span={8}>
              <Statistic title="在途审批单" value={scanResult.summary.instanceCount} suffix="个" />
            </Col>
            <Col span={8}>
              <Statistic title="待更新节点" value={scanResult.summary.nodeCount} suffix="个" />
            </Col>
          </Row>

          <Tabs
            defaultActiveKey="formTypes"
            items={[
              {
                key: 'formTypes',
                label: '流程定义',
                children: (
                  <Table
                    rowKey="code"
                    dataSource={scanResult.formTypes}
                    columns={formTypeColumns}
                    pagination={false}
                    rowSelection={{
                      selectedRowKeys: selectedCodes,
                      onChange: keys => setSelectedCodes(keys as string[]),
                    }}
                    size="small"
                  />
                ),
              },
              {
                key: 'instances',
                label: '在途审批单',
                children: (
                  <Table
                    rowKey="nodeId"
                    dataSource={scanResult.instances}
                    columns={instanceColumns}
                    pagination={false}
                    rowSelection={{
                      selectedRowKeys: selectedInstanceIds,
                      onChange: keys => setSelectedInstanceIds(keys as number[]),
                    }}
                    size="small"
                  />
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* 交接历史 */}
      <Collapse
        className={styles.historyCollapse}
        onChange={keys => {
          if ((keys as string[]).includes('history') && !historyLoadedRef.current) {
            loadHistory();
          }
        }}
        items={[{
          key: 'history',
          label: <span><HistoryOutlined /> 交接历史</span>,
          children: (
            <Table
              rowKey="id"
              dataSource={history.list}
              columns={historyColumns}
              size="small"
              pagination={{
                current: historyPage,
                total: history.total,
                pageSize: 10,
                showSizeChanger: false,
                onChange: (page) => loadHistory(page, 10),
              }}
            />
          ),
        }]}
      />
    </div>
  );
};

export default HandoverPage;
