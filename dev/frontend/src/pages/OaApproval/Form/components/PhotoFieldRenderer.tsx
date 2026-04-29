import React from 'react';
import { Upload, Image, Spin, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { PaperClipOutlined } from '@ant-design/icons';
import type { CustomerLicenseInfo } from './ErpFieldRenderer';
import styles from '../index.less';

interface PhotoFieldRendererProps {
  value?: unknown;
  onChange?: (value: unknown) => void;
  maxCount?: number;
  customerLicenseInfo?: CustomerLicenseInfo | null;
  licenseLoading?: boolean;
}

/** 照片字段渲染组件（含 ERP 执照图片展示） */
const PhotoFieldRenderer: React.FC<PhotoFieldRendererProps> = ({
  value, onChange, maxCount, customerLicenseInfo, licenseLoading,
}) => {
  return (
    <div>
      {/* 正在异步获取执照图片 URL */}
      {licenseLoading && (
        <div className={styles.existingLicense}>
          <Spin size="small" />
          <span style={{ marginLeft: 8, color: '#999' }}>正在获取营业执照信息...</span>
        </div>
      )}
      {/* 客户已有营业执照且有图片 URL 时展示 */}
      {!licenseLoading && customerLicenseInfo?.hasLicense && customerLicenseInfo.attachedPicUrls.length > 0 && (
        <div className={styles.existingLicense}>
          <div className={styles.existingLicenseTip}>
            <PaperClipOutlined /> 客户档案已有营业执照（{customerLicenseInfo.imageCount} 张）
          </div>
          <div className={styles.existingLicenseImages}>
            {customerLicenseInfo.attachedPicUrls.map((url, idx) => (
              <Image key={idx} src={url} className={styles.licenseThumbnail}
                width={80} height={80} style={{ objectFit: 'cover', borderRadius: 4 }} />
            ))}
          </div>
        </div>
      )}
      {/* 有执照记录但图片 URL 获取失败 */}
      {!licenseLoading && customerLicenseInfo?.hasLicense && customerLicenseInfo.attachedPicUrls.length === 0 && (
        <div className={styles.existingLicense}>
          <div className={styles.existingLicenseTip}>
            <PaperClipOutlined /> 客户档案有营业执照记录，但图片暂不可用，请上传新照片
          </div>
        </div>
      )}
      <Upload listType="picture-card" accept="image/*" multiple maxCount={maxCount}
        fileList={(value as UploadFile[]) || []}
        beforeUpload={(file) => {
          if (file.size / 1024 / 1024 >= 5) {
            message.error('图片大小不能超过 5MB');
            return Upload.LIST_IGNORE;
          }
          return false;
        }}
        onChange={({ fileList: newList }) => onChange?.(newList)}
      >
        <div>上传图片</div>
      </Upload>
      {customerLicenseInfo?.hasLicense && !licenseLoading && (
        <div className={styles.uploadTip}>如需补充执照图片，可在上方上传（新图片将追加到已有执照中）</div>
      )}
    </div>
  );
};

export default PhotoFieldRenderer;
