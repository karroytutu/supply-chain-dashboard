/**
 * 上传字段统一控件（upload）
 * mode=readonly: 图片预览 + 文件链接
 * mode=editable: UploadFieldRenderer
 */
import React from 'react';
import { Image, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import UploadFieldRenderer from '@/pages/Oa/Form/components/UploadFieldRenderer';
import type { FieldControlProps } from './types';
import styles from '../FormFieldRenderer.less';

const { Text } = Typography;

function isImageFileName(name: string): boolean {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext || '');
}

const UploadFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange }) => {
  if (mode === 'editable') {
    return (
      <UploadFieldRenderer
        value={value}
        onChange={onChange!}
        maxCount={field.maxCount}
        accept={field.accept}
      />
    );
  }

  // readonly
  const files = value as Array<{ name: string; url: string; thumbUrl?: string }>;
  if (!files || files.length === 0) return <Text type="secondary">-</Text>;

  const getImageSrc = (f: typeof files[number]) => f.url || f.thumbUrl || '';
  const imageFiles = files.filter(f => isImageFileName(f.name));
  const otherFiles = files.filter(f => !isImageFileName(f.name));

  return (
    <div className={styles.fileList}>
      {imageFiles.length > 0 && (
        <Image.PreviewGroup>
          <div className={styles.imageGroup}>
            {imageFiles.map((file, index) => (
              <Image
                key={index}
                src={getImageSrc(file)}
                alt={file.name}
                width={60}
                height={60}
                style={{ objectFit: 'cover', borderRadius: 4 }}
              />
            ))}
          </div>
        </Image.PreviewGroup>
      )}
      {otherFiles.map((file, index) => {
        const href = file.url || file.thumbUrl;
        return href ? (
          <a key={`doc-${index}`} href={href} target="_blank" rel="noopener noreferrer">
            <FileTextOutlined /> {file.name}
          </a>
        ) : (
          <Text key={`doc-${index}`}><FileTextOutlined /> {file.name}</Text>
        );
      })}
    </div>
  );
};

export default UploadFieldControl;
