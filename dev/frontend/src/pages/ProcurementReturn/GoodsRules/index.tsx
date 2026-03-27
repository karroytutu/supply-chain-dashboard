/**
 * 商品退货规则管理页面
 */
import React, { useState, useCallback } from 'react';
import { Card, Input, Select, Button, Modal, Form, Radio, Space, Breadcrumb } from 'antd';
import { SearchOutlined, ReloadOutlined, HomeOutlined } from '@ant-design/icons';
import styles from './index.less';

// Hooks
import { useGoodsRules } from './hooks/useGoodsRules';

// Components
import RuleStats from './components/RuleStats';
import RulesTable from './components/RulesTable';
import BatchActionBar from './components/BatchActionBar';

// Types
import type { GoodsReturnRule } from '@/types/goods-return-rules';

const { Search } = Input;

export default function GoodsRulesPage() {
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustingRecord, setAdjustingRecord] = useState<GoodsReturnRule | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [form] = Form.useForm();

  const {
    loading,
    dataSource,
    total,
    page,
    pageSize,
    stats,
    keyword,
    canReturnFilter,
    selectedRowKeys,
    batchLoading,
    setKeyword,
    setCanReturnFilter,
    setSelectedRowKeys,
    fetchRules,
    handleSearch,
    handleBatchSet,
    handleUpdate,
    handlePageChange,
  } = useGoodsRules();

  // 打开调整弹窗
  const openAdjustModal = useCallback((record: GoodsReturnRule) => {
    setAdjustingRecord(record);
    form.setFieldsValue({
      canReturnToSupplier: record.canReturnToSupplier,
      comment: record.comment || '',
    });
    setAdjustModalVisible(true);
  }, [form]);

  // 关闭调整弹窗
  const closeAdjustModal = useCallback(() => {
    setAdjustModalVisible(false);
    setAdjustingRecord(null);
    form.resetFields();
  }, [form]);

  // 提交调整
  const submitAdjust = useCallback(async () => {
    if (!adjustingRecord) return;

    try {
      const values = await form.validateFields();
      setAdjustLoading(true);
      const success = await handleUpdate(
        adjustingRecord.id,
        values.canReturnToSupplier,
        values.comment
      );
      if (success) {
        closeAdjustModal();
      }
    } catch (error) {
      // 表单校验失败
    } finally {
      setAdjustLoading(false);
    }
  }, [adjustingRecord, form, handleUpdate, closeAdjustModal]);

  // 统计卡片筛选点击
  const handleStatsFilterClick = useCallback((canReturn: boolean | undefined) => {
    setCanReturnFilter(canReturn);
  }, [setCanReturnFilter]);

  // 批量设置
  const onBatchSet = useCallback(async (canReturn: boolean) => {
    await handleBatchSet(canReturn);
  }, [handleBatchSet]);

  return (
    <div className={styles.container}>
      {/* 面包屑 */}
      <Breadcrumb
        className={styles.breadcrumb}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { title: '采购退货' },
          { title: '商品退货规则' },
        ]}
      />

      {/* 统计卡片 */}
      <RuleStats
        stats={stats}
        activeFilter={canReturnFilter}
        onFilterClick={handleStatsFilterClick}
      />

      {/* 批量操作栏 */}
      <BatchActionBar
        selectedCount={selectedRowKeys.length}
        onBatchSet={onBatchSet}
        loading={batchLoading}
      />

      {/* 搜索筛选区 */}
      <Card className={styles.filterCard}>
        <div className={styles.filterBar}>
          <Space wrap>
            <Search
              placeholder="搜索商品名称或ID"
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 280 }}
              enterButton={<SearchOutlined />}
            />
            <Select
              placeholder="退货规则"
              allowClear
              value={canReturnFilter}
              onChange={setCanReturnFilter}
              style={{ width: 150 }}
              options={[
                { label: '全部', value: undefined },
                { label: '可退货', value: true },
                { label: '不可退货', value: false },
              ]}
            />
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchRules()}
          >
            刷新
          </Button>
        </div>
      </Card>

      {/* 表格 */}
      <Card className={styles.tableCard}>
        <RulesTable
          dataSource={dataSource}
          loading={loading}
          selectedRowKeys={selectedRowKeys}
          onSelectChange={setSelectedRowKeys}
          pagination={{
            current: page,
            pageSize,
            total,
          }}
          onPageChange={handlePageChange}
          onAdjust={openAdjustModal}
        />
      </Card>

      {/* 调整规则弹窗 */}
      <Modal
        title="调整退货规则"
        open={adjustModalVisible}
        onOk={submitAdjust}
        onCancel={closeAdjustModal}
        confirmLoading={adjustLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="商品名称">
            <span>{adjustingRecord?.goodsName}</span>
          </Form.Item>
          <Form.Item label="商品ID">
            <span>{adjustingRecord?.goodsId}</span>
          </Form.Item>
          <Form.Item
            name="canReturnToSupplier"
            label="退货规则"
            rules={[{ required: true, message: '请选择退货规则' }]}
          >
            <Radio.Group>
              <Radio value={true}>可采购退货</Radio>
              <Radio value={false}>不可采购退货</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="comment" label="备注">
            <Input.TextArea
              placeholder="请输入备注信息（可选）"
              rows={3}
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
