/**
 * 银行账户下拉选择器
 * 默认展示类似 Select 的输入框，点击后弹窗选择
 * 弹窗内支持搜索、新增、编辑、删除，选中项高亮
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Button, Form, Input, Popconfirm, message, Spin, Empty } from 'antd';
import { PlusOutlined, SearchOutlined, DownOutlined } from '@ant-design/icons';
import {
  getUserBankAccounts,
  createUserBankAccount,
  deleteUserBankAccount,
  type UserBankAccount,
} from '@/services/api/oa';

/** 选中银行账户的值结构 */
export interface BankAccountValue {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName: string;
}

interface BankAccountSelectorProps {
  /** 当前选中的银行账户（Ant Design Form 受控组件 value） */
  value?: BankAccountValue | null;
  /** 选中变更回调（Ant Design Form 受控组件 onChange） */
  onChange?: (value: BankAccountValue | null) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/** 账号完整展示，不做掩码 */
function maskAccountNumber(num: string): string {
  return num || '';
}

const BankAccountSelector: React.FC<BankAccountSelectorProps> = ({ value, onChange, disabled = false }) => {
  const [accounts, setAccounts] = useState<UserBankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectorModalVisible, setSelectorModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<UserBankAccount | null>(null);
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserBankAccounts();
      setAccounts(data || []);
    } catch {
      message.error('获取银行账户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 仅在弹窗打开时加载账户列表
  useEffect(() => {
    if (selectorModalVisible) {
      fetchAccounts();
    }
  }, [selectorModalVisible, fetchAccounts]);

  // 客户端搜索过滤
  const filteredAccounts = useMemo(() => {
    if (!searchKeyword.trim()) return accounts;
    const kw = searchKeyword.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        a.accountName.toLowerCase().includes(kw) ||
        a.accountNumber.toLowerCase().includes(kw) ||
        a.bankName.toLowerCase().includes(kw) ||
        (a.branchName || '').toLowerCase().includes(kw),
    );
  }, [accounts, searchKeyword]);

  const handleSelect = (account: UserBankAccount) => {
    onChange?.({
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branchName: account.branchName || '',
    });
    setSelectorModalVisible(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUserBankAccount(id);
      message.success('删除成功');
      fetchAccounts();
    } catch {
      message.error('删除失败');
    }
  };

  // 新增/编辑提交（后端 UPSERT，复用 createUserBankAccount）
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      await createUserBankAccount(values);
      message.success(editingAccount ? '编辑成功' : '添加成功');
      form.resetFields();
      setEditModalVisible(false);
      await fetchAccounts();
      // 新增后自动选中
      if (!editingAccount) {
        onChange?.({
          accountName: values.accountName,
          accountNumber: values.accountNumber,
          bankName: values.bankName,
          branchName: values.branchName || '',
        });
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openAdd = () => {
    setEditingAccount(null);
    form.resetFields();
    setEditModalVisible(true);
  };

  const openEdit = (account: UserBankAccount) => {
    setEditingAccount(account);
    form.setFieldsValue({
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branchName: account.branchName || '',
    });
    setEditModalVisible(true);
  };

  // 输入框展示摘要
  const displayText = value
    ? `${value.accountName} · ${value.bankName} ${maskAccountNumber(value.accountNumber)}`
    : '';

  return (
    <div>
      {/* 下拉框样式的输入框 */}
      <div
        style={{
          minHeight: 32,
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          padding: '4px 11px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f5f5f5' : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'border-color 0.2s',
        }}
        onClick={disabled ? undefined : () => setSelectorModalVisible(true)}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = '#1890ff'; }}
        onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.borderColor = '#d9d9d9'; }}
      >
        {value ? (
          <span style={{ fontSize: 14, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayText}
          </span>
        ) : (
          <span style={{ color: '#bfbfbf' }}>请选择收款银行账户</span>
        )}
        <DownOutlined style={{ color: '#bfbfbf', fontSize: 12, flexShrink: 0 }} />
      </div>

      {/* 选择弹窗 */}
      <Modal
        title="选择收款银行账户"
        open={selectorModalVisible}
        onCancel={() => setSelectorModalVisible(false)}
        footer={null}
        width={520}
        styles={{ body: { padding: 0 } }}
      >
        {/* 搜索框 */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="输入账户名、卡号搜索"
            allowClear
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>

        {/* 账户列表 */}
        <Spin spinning={loading}>
          {filteredAccounts.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史银行账户" />
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {filteredAccounts.map((account) => {
                const isSelected = value?.accountNumber === account.accountNumber;
                return (
                  <div
                    key={account.id}
                    onClick={() => handleSelect(account)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f5f5f5',
                      background: isSelected ? '#e6f7ff' : '#fff',
                      borderLeft: isSelected ? '3px solid #1890ff' : '3px solid transparent',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>
                        {account.accountName}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        {account.bankName} {maskAccountNumber(account.accountNumber)}
                      </div>
                      {account.branchName && (
                        <div style={{ fontSize: 12, color: '#999', marginTop: 1 }}>
                          {account.branchName}
                        </div>
                      )}
                    </div>
                    <div
                      style={{ flexShrink: 0, display: 'flex', gap: 4 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button type="link" size="small" onClick={() => openEdit(account)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="确认删除此账户？"
                        onConfirm={() => handleDelete(account.id)}
                      >
                        <Button type="link" size="small" danger>
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Spin>

        {/* 添加新收款账号 */}
        <div style={{ padding: 8, borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Button type="dashed" block icon={<PlusOutlined />} onClick={openAdd}>
            添加新收款账号
          </Button>
        </div>

        {/* 新增/编辑弹窗（嵌套 Modal，zIndex 高于外层） */}
        <Modal
          title={editingAccount ? '编辑银行账户' : '新增银行账户'}
          open={editModalVisible}
          width={440}
          zIndex={1100}
          onCancel={() => {
            form.resetFields();
            setEditModalVisible(false);
          }}
          onOk={handleSubmit}
          confirmLoading={submitLoading}
        >
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item
              name="accountName"
              label="户名"
              rules={[{ required: true, message: '请输入户名' }]}
            >
              <Input placeholder="请输入户名" />
            </Form.Item>
            <Form.Item
              name="accountNumber"
              label="账号"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input placeholder="请输入银行账号" disabled={!!editingAccount} />
            </Form.Item>
            <Form.Item
              name="bankName"
              label="银行"
              rules={[{ required: true, message: '请输入银行名称' }]}
            >
              <Input placeholder="如：中国工商银行" />
            </Form.Item>
            <Form.Item name="branchName" label="开户行（选填）">
              <Input placeholder="如：贵州分行贵阳支行" />
            </Form.Item>
          </Form>
        </Modal>
      </Modal>
    </div>
  );
};

export default BankAccountSelector;
