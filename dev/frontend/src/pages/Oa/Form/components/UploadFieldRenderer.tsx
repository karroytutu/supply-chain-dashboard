/**
 * 上传字段渲染组件
 * 支持文件真正上传到服务器（/api/oa/upload-attachment），获取永久 URL
 * 支持图片弹窗预览（Image.PreviewGroup）和非图片文件新标签页打开
 * 用于 OA 表单中 upload 类型字段的统一渲染
 */
import React, { useState, useCallback } from 'react';
import { Upload, Button, Image, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import type { UploadRequestOption } from 'rc-upload/lib/interface';
import { validateDocumentFile } from '@/utils/uploadValidation';

interface UploadFieldRendererProps {
  value?: unknown;
  onChange?: (value: unknown) => void;
  maxCount?: number;
  disabled?: boolean;
  beforeUpload?: (file: any) => any;
  /** 允许的文件格式，覆盖默认值 */
  accept?: string;
}

/** 判断文件是否为图片 */
function isImageFile(file: UploadFile): boolean {
  if (file.type?.startsWith('image/')) return true;
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext || '');
}

/** 获取文件可预览的 URL */
function getFileUrl(file: UploadFile): string | undefined {
  return file.url || file.thumbUrl;
}

/**
 * 自定义上传请求：将文件上传到 /api/oa/upload-attachment
 * 上传成功后用服务器返回的永久 URL 替换本地 blob URL
 */
function customUploadRequest(options: UploadRequestOption): void {
  const { file, onSuccess, onError, onProgress } = options;
  const formData = new FormData();
  formData.append('files', file as File);

  const token = localStorage.getItem('auth_token');
  const xhr = new XMLHttpRequest();

  if (onProgress) {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress({ percent: Math.round((e.loaded / e.total) * 100) } as any);
      }
    });
  }

  xhr.addEventListener('load', () => {
    try {
      const resp = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && resp.data?.urls?.length > 0) {
        onSuccess?.({ url: resp.data.urls[0] } as any);
      } else {
        onError?.(new Error(resp.message || '上传失败') as any);
      }
    } catch {
      onError?.(new Error('上传响应解析失败') as any);
    }
  });

  xhr.addEventListener('error', () => {
    onError?.(new Error('网络错误，上传失败') as any);
  });

  xhr.open('POST', '/api/oa/upload-attachment');
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }
  xhr.send(formData);
}

const UploadFieldRenderer: React.FC<UploadFieldRendererProps> = ({
  value,
  onChange,
  maxCount,
  disabled,
  beforeUpload,
  accept,
}) => {
  const fileList: UploadFile[] = (Array.isArray(value) ? value : []) as UploadFile[];

  // 图片预览状态
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCurrent, setPreviewCurrent] = useState(0);

  // 收集所有可预览的图片 URL
  const imageUrls = fileList
    .filter(f => f.status === 'done' || !f.status)
    .map(f => getFileUrl(f))
    .filter((url): url is string => !!url);

  const handleChange = useCallback(({ fileList: newList }: { fileList: UploadFile[] }) => {
    // 上传完成后用服务器永久 URL 替换；只保留必要字段避免存入 blob URL
    const enriched = newList.map(f => {
      if (f.status === 'done' && f.response && typeof f.response === 'object' && 'url' in f.response) {
        return { name: f.name, url: (f.response as any).url, uid: f.uid, status: 'done' as const };
      }
      if (f.status === 'error') return null; // 过滤上传失败的文件
      // 正在上传或已有服务器 URL 的文件：裁剪字段，剔除 originFileObj/thumbUrl 等不可序列化数据
      return { uid: f.uid, name: f.name, status: f.status, percent: f.percent, url: f.url };
    }).filter(Boolean) as UploadFile[];

    onChange?.(enriched);
  }, [onChange]);

  const handlePreview = useCallback((file: UploadFile) => {
    if (isImageFile(file) && getFileUrl(file)) {
      const url = getFileUrl(file)!;
      const idx = imageUrls.indexOf(url);
      setPreviewCurrent(idx >= 0 ? idx : 0);
      setPreviewVisible(true);
    } else {
      const url = getFileUrl(file);
      if (url) window.open(url, '_blank');
    }
  }, [imageUrls]);

  return (
    <>
      <Upload
        multiple
        maxCount={maxCount}
        accept={accept || 'image/*,.pdf,.doc,.docx,.xls,.xlsx'}
        beforeUpload={beforeUpload || ((file: any) => {
          if (!validateDocumentFile(file)) return Upload.LIST_IGNORE;
          return true; // 放行上传，让 customRequest 接管立即上传
        })}
        customRequest={customUploadRequest}
        fileList={fileList}
        onChange={handleChange}
        onPreview={handlePreview}
        listType="picture"
        onRemove={!disabled ? undefined : () => false}
      >
        <Button icon={<UploadOutlined />} disabled={disabled}>上传附件</Button>
        {maxCount && (
          <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
            （最多 {maxCount} 个文件）
          </span>
        )}
      </Upload>
      {/* 隐藏的图片预览容器，仅用于驱动 Image.PreviewGroup 弹窗 */}
      <div style={{ display: 'none' }}>
        <Image.PreviewGroup
          preview={{
            visible: previewVisible,
            src: imageUrls[previewCurrent] || '',
            current: previewCurrent,
            onVisibleChange: (vis) => setPreviewVisible(vis),
            onChange: (idx) => setPreviewCurrent(idx),
          }}
        >
          {imageUrls.map((url, i) => (
            <Image key={i} src={url} />
          ))}
        </Image.PreviewGroup>
      </div>
    </>
  );
};

export default UploadFieldRenderer;
