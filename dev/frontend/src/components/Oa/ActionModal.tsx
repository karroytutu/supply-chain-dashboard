import React, { useState } from 'react';
import { Modal, Input, Select, Segmented, Upload, message } from 'antd';
import { PlusOutlined, PaperClipOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import type { AttachmentMeta } from '@/types/oa';
import type { SendBackTarget } from './hooks/useApprovalActions';
import { requestFormData } from '@/services/api/request';

const { TextArea } = Input;
const { Dragger } = Upload;

interface TransferUser {
  id: number;
  name: string;
}

interface ActionModalProps {
  visible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | 'comment' | 'send_back' | null;
  actionComment: string;
  actionLoading: boolean;
  /** 已上传的附件列表 */
  attachments?: AttachmentMeta[];
  /** 附件变更回调 */
  onAttachmentsChange?: (attachments: AttachmentMeta[]) => void;
  /** 转交候选人列表（从后端获取） */
  transferUsers?: TransferUser[];
  /** 节点类型，影响弹窗标题文案 */
  nodeType?: 'approval' | 'handle' | 'auto' | 'cc';
  /** 可退回的目标环节列表 */
  sendBackTargets?: SendBackTarget[];
  /** 当前选中的退回目标环节序号 */
  sendBackTargetNodeOrder?: number | null;
  /** 退回目标环节变更回调 */
  onSendBackTargetChange?: (order: number | null) => void;
  onOk: () => Promise<void>;
  onCancel: () => void;
  onCommentChange: (comment: string) => void;
  onTransferUserChange: (id: number | null) => void;
  /** 加签选中的人员 ID 列表 */
  countersignUserIds?: number[];
  /** 加签类型：前加签/后加签 */
  countersignType?: 'before' | 'after';
  /** 加签人员变更回调 */
  onCountersignUserIdsChange?: (ids: number[]) => void;
  /** 加签类型变更回调 */
  onCountersignTypeChange?: (type: 'before' | 'after') => void;
}

/** 获取操作弹窗标题 */
const getActionModalTitle = (actionType: string | null, nodeType?: 'approval' | 'handle' | 'auto' | 'cc') => {
  if (actionType === 'comment') return '添加评论';
  if (actionType === 'send_back') return '退回';
  if (nodeType === 'handle') {
    switch (actionType) {
      case 'approve': return '确认完成';
      case 'reject': return '拒绝';
      case 'update': return '保存草稿';
      default: return actionType === 'transfer' ? '转交' : '操作';
    }
  }
  // 审批型（默认）保持原有标题
  switch (actionType) {
    case 'approve': return '已通过';
    case 'reject': return '已拒绝';
    case 'transfer': return '转交';
    case 'countersign': return '加签处理';
    default: return '操作';
  }
};

/** 格式化文件大小 */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/** 通用上传处理函数（使用项目统一的 requestFormData 封装） */
const handleUpload = async (
  file: File,
  endpoint: string,
  fieldName: string,
  onSuccess: (attachment: AttachmentMeta) => void,
  onError: (error: Error) => void
) => {
  const formData = new FormData();
  formData.append(fieldName, file);
  try {
    const resp = await requestFormData<{ attachments: AttachmentMeta[] }>(`/oa${endpoint}`, formData);
    if (resp?.attachments?.length > 0) {
      onSuccess(resp.attachments[0]);
    } else {
      onError(new Error('上传响应中无附件数据'));
    }
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error('上传失败'));
  }
};

const ActionModal: React.FC<ActionModalProps> = ({
  visible, actionType, actionComment, actionLoading, attachments = [], onAttachmentsChange,
  transferUsers = [], nodeType, sendBackTargets = [], sendBackTargetNodeOrder, onSendBackTargetChange,
  countersignUserIds = [], countersignType = 'after', onCountersignUserIdsChange, onCountersignTypeChange,
  onOk, onCancel, onCommentChange, onTransferUserChange,
}) => {
  const [imageFileList, setImageFileList] = useState<UploadFile[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // 用 ref 追踪最新附件列表，避免并发上传时闭包捕获过期值
  const attachmentsRef = React.useRef(attachments);
  attachmentsRef.current = attachments;

  // 弹窗打开时重置文件列表
  React.useEffect(() => {
    if (visible) {
      setImageFileList([]);
      setFileList([]);
    }
  }, [visible]);

  const handleImageUpload = (options: any) => {
    const { file, onSuccess, onError } = options;
    handleUpload(
      file as File,
      '/upload-comment-image',
      'images',
      (attachment) => {
        onSuccess?.(attachment as any);  // 存完整对象，确保 remove 时 response.url 可靠
        onAttachmentsChange?.([...attachmentsRef.current, attachment]);
      },
      (error) => {
        message.error(error.message);
        onError?.(error as any);
      }
    );
  };

  const handleFileUpload = (options: any) => {
    const { file, onSuccess, onError } = options;
    handleUpload(
      file as File,
      '/upload-comment-file',
      'files',
      (attachment) => {
        onSuccess?.(attachment as any);  // 存完整对象，确保 remove 时 response.url 可靠
        onAttachmentsChange?.([...attachmentsRef.current, attachment]);
      },
      (error) => {
        message.error(error.message);
        onError?.(error as any);
      }
    );
  };

  const handleImageRemove = (file: UploadFile) => {
    const url = file.response?.url;
    if (url) {
      onAttachmentsChange?.(attachmentsRef.current.filter(a => a.url !== url));
    }
    return true;
  };

  const handleFileRemove = (file: UploadFile) => {
    const url = file.response?.url;
    if (url) {
      onAttachmentsChange?.(attachmentsRef.current.filter(a => a.url !== url));
    }
    return true;
  };

  const beforeImageUpload = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      message.warning(`图片 "${file.name}" 超过 5MB 限制`);
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const beforeFileUpload = (file: File) => {
    if (file.size > 200 * 1024 * 1024) {
      message.warning(`文件 "${file.name}" 超过 200MB 限制`);
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const imageAttachments = attachments.filter(a => a.isImage);
  const fileAttachments = attachments.filter(a => !a.isImage);

  return (
    <Modal
      title={getActionModalTitle(actionType, nodeType)}
      open={visible}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={actionLoading}
      okText="确定"
      cancelText="取消"
      width={560}
    >
      <div className="actionModal">
        {actionType === 'send_back' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>退回目标环节：</label>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择退回目标环节"
              value={sendBackTargetNodeOrder ?? undefined}
              onChange={(value) => onSendBackTargetChange?.(value)}
              options={sendBackTargets.map((t) => ({ value: t.nodeOrder, label: t.nodeName }))}
            />
          </div>
        )}
        {actionType === 'transfer' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>转交人员：</label>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择转交人员"
              onChange={(value) => onTransferUserChange(value)}
              showSearch
              optionFilterProp="label"
              options={transferUsers.map((u) => ({ value: u.id, label: u.name }))}
            />
          </div>
        )}
        {actionType === 'countersign' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>加签类型：</label>
              <Segmented
                block
                value={countersignType}
                onChange={(v) => onCountersignTypeChange?.(v as 'before' | 'after')}
                options={[
                  { value: 'before', label: '前加签（加签人先审）' },
                  { value: 'after', label: '后加签（当前人先审）' },
                ]}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>加签人员：</label>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="请选择加签人员"
                value={countersignUserIds}
                onChange={(ids) => onCountersignUserIdsChange?.(ids)}
                showSearch
                optionFilterProp="label"
                options={transferUsers.map((u) => ({ value: u.id, label: u.name }))}
              />
            </div>
          </>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            {actionType === 'comment' ? '评论内容：' :
             actionType === 'send_back' ? '退回原因（选填）：' :
             '审批意见：'}
          </label>
          <TextArea
            rows={4}
            placeholder={actionType === 'comment' ? '请输入评论内容' : '请输入审批意见（选填）'}
            value={actionComment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
        </div>

        {/* 图片上传区域 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#595959', fontSize: 13 }}>
            图片（最多9张，每张≤5MB）
          </label>
          <Upload
            listType="picture-card"
            fileList={imageFileList}
            onChange={({ fileList: newList }) => setImageFileList(newList)}
            customRequest={handleImageUpload}
            beforeUpload={beforeImageUpload}
            onRemove={handleImageRemove}
            maxCount={9}
            accept="image/jpeg,image/png,image/gif,image/webp"
          >
            {imageFileList.length >= 9 ? null : (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8, fontSize: 12 }}>上传图片</div>
              </div>
            )}
          </Upload>
        </div>

        {/* 文件上传区域 */}
        <div style={{ marginBottom: 0 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#595959', fontSize: 13 }}>
            附件（最多9个，每个≤200MB）
          </label>
          {/* 已上传文件列表 */}
          {fileAttachments.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {fileAttachments.map((att, idx) => (
                <div
                  key={att.url}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '6px 8px',
                    background: '#fafafa', borderRadius: 4, marginBottom: 4,
                    fontSize: 12, color: '#595959',
                  }}
                >
                  <PaperClipOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </span>
                  <span style={{ marginLeft: 8, color: '#8c8c8c' }}>{formatFileSize(att.size)}</span>
                  <DeleteOutlined
                    style={{ marginLeft: 8, color: '#ff4d4f', cursor: 'pointer' }}
                    onClick={() => {
                      onAttachmentsChange?.(attachments.filter(a => a.url !== att.url));
                      setFileList(prev => prev.filter(f => f.response?.url !== att.url));
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          <Dragger
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList.filter(f => f.status === 'uploading' || f.status === 'done'))}
            customRequest={handleFileUpload}
            beforeUpload={beforeFileUpload}
            onRemove={handleFileRemove}
            maxCount={9}
            showUploadList={false}
            multiple
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 13 }}>点击或拖拽文件到此区域上传</p>
          </Dragger>
        </div>
      </div>
    </Modal>
  );
};

export default ActionModal;
