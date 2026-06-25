/**
 * 权限配置抽屉组件
 * @module pages/Oa/FormConfig/components/PermissionConfigDrawer
 *
 * 集中配置表单的可发起人、可查看人、可导出人权限。
 * 从右侧滑出，3个权限区块统一编辑，底部保存/取消按钮。
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Form, Button, Space, message } from 'antd';
import type { FormTypeDefinition } from '@/types/oa';
import RoleUserSelect from './RoleUserSelect';

interface PermissionConfigDrawerProps {
  /** 抽屉是否可见 */
  visible: boolean;
  /** 当前编辑的表单类型数据 */
  record: FormTypeDefinition | null;
  /** 岗位列表（复用列表页已加载的数据） */
  roles: Array<{ code: string; name: string }>;
  /** 关闭抽屉回调 */
  onClose: () => void;
  /** 保存回调 */
  onSave: (code: string, data: PermissionData) => Promise<void>;
}

interface PermissionData {
  allowedRoles?: string[];
  allowedUsers?: number[];
  dataReadRoles?: string[];
  dataReadUsers?: number[];
  dataExportRoles?: string[];
  dataExportUsers?: number[];
}

const PermissionConfigDrawer: React.FC<PermissionConfigDrawerProps> = ({
  visible,
  record,
  roles,
  onClose,
  onSave,
}) => {
  const [saving, setSaving] = useState(false);

  // 6个draft状态，管理3种权限的临时值
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [allowedUsers, setAllowedUsers] = useState<number[]>([]);
  const [dataReadRoles, setDataReadRoles] = useState<string[]>([]);
  const [dataReadUsers, setDataReadUsers] = useState<number[]>([]);
  const [dataExportRoles, setDataExportRoles] = useState<string[]>([]);
  const [dataExportUsers, setDataExportUsers] = useState<number[]>([]);

  // 打开抽屉时初始化draft状态
  useEffect(() => {
    if (visible && record) {
      setAllowedRoles(record.allowedRoles || []);
      setAllowedUsers(record.allowedUsers || []);
      setDataReadRoles(record.dataReadRoles || []);
      setDataReadUsers(record.dataReadUsers || []);
      setDataExportRoles(record.dataExportRoles || []);
      setDataExportUsers(record.dataExportUsers || []);
    }
  }, [visible, record]);

  // 保存
  const handleSave = useCallback(async () => {
    if (!record) return;
    setSaving(true);
    try {
      await onSave(record.code, {
        allowedRoles,
        allowedUsers,
        dataReadRoles,
        dataReadUsers,
        dataExportRoles,
        dataExportUsers,
      });
    } catch (error: any) {
      // 错误提示由hook处理，这里不重复
    } finally {
      setSaving(false);
    }
  }, [record, allowedRoles, allowedUsers, dataReadRoles, dataReadUsers, dataExportRoles, dataExportUsers, onSave]);

  // 取消
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!record) return null;

  return (
    <Drawer
      title={`${record.name} — 权限配置`}
      placement="right"
      width={420}
      open={visible}
      onClose={handleCancel}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleCancel} disabled={saving}>
            取消
          </Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存配置
          </Button>
        </div>
      }
    >
      <Form layout="vertical">
        <Form.Item label="可发起人">
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            可发起此表单的岗位和人员，留空表示不限制
          </div>
          <RoleUserSelect
            roles={roles}
            selectedRoles={allowedRoles}
            selectedUsers={allowedUsers}
            onChange={(newRoles, newUsers) => {
              setAllowedRoles(newRoles);
              setAllowedUsers(newUsers);
            }}
          />
        </Form.Item>

        <Form.Item label="可查看人" style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            可查看此表单审批数据的岗位和人员
          </div>
          <RoleUserSelect
            roles={roles}
            selectedRoles={dataReadRoles}
            selectedUsers={dataReadUsers}
            onChange={(newRoles, newUsers) => {
              setDataReadRoles(newRoles);
              setDataReadUsers(newUsers);
            }}
          />
        </Form.Item>

        <Form.Item label="可导出人" style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            可导出此表单审批数据的岗位和人员
          </div>
          <RoleUserSelect
            roles={roles}
            selectedRoles={dataExportRoles}
            selectedUsers={dataExportUsers}
            onChange={(newRoles, newUsers) => {
              setDataExportRoles(newRoles);
              setDataExportUsers(newUsers);
            }}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default PermissionConfigDrawer;
