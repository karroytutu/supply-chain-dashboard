import React from 'react';
import { Typography, Image } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import styles from './FormFieldRenderer.less';

const { Text } = Typography;

interface PhotoFieldDisplayProps {
  value: unknown;
  formData?: Record<string, unknown>;
  erpLicenseUrls?: string[];
}

/** 照片字段展示组件（审批详情只读模式） */
const PhotoFieldDisplay: React.FC<PhotoFieldDisplayProps> = ({ value, formData, erpLicenseUrls }) => {
  const photos = value as Array<{ uid?: string; name?: string; url?: string; thumbUrl?: string; status?: string }>;
  // 获取 ERP 执照图片 URL
  // 第一优先级：formData 中已存储的 _erpLicenseUrls（beforeSubmit 注入，新提交的审批）
  // 第二优先级：外部传入的 erpLicenseUrls（由 useErpLicenseResolve 动态获取，兼容历史数据）
  const licenseUrls = (formData?._erpLicenseUrls && Array.isArray(formData._erpLicenseUrls) && (formData._erpLicenseUrls as string[]).length > 0)
    ? (formData._erpLicenseUrls as string[])
    : (erpLicenseUrls || []);
  const hasUploaded = photos && photos.length > 0;
  const hasErpLicense = licenseUrls.length > 0;
  if (!hasUploaded && !hasErpLicense) return <Text type="secondary">-</Text>;
  return (
    <div className={styles.photoContainer}>
      <Image.PreviewGroup>
        {hasErpLicense && (
          <div className={styles.erpLicenseSection}>
            <div className={styles.erpLicenseTip}>
              <PaperClipOutlined /> 客户档案已有营业执照（{licenseUrls.length} 张）
            </div>
            <div className={styles.erpLicenseImages}>
              {licenseUrls.map((url, idx) => (
                <Image
                  key={`erp-${idx}`}
                  src={url}
                  width={60}
                  height={60}
                  style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8 }}
                  alt="营业执照"
                />
              ))}
            </div>
          </div>
        )}
        {hasUploaded && photos.map((photo, index) => {
          const src = photo.thumbUrl || photo.url;
          if (!src) return null;
          return (
            <Image
              key={photo.uid || index}
              src={src}
              width={60}
              height={60}
              style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8 }}
              alt={photo.name || '图片'}
              preview={photo.url ? { src: photo.url } : undefined}
            />
          );
        })}
      </Image.PreviewGroup>
    </div>
  );
};

export default PhotoFieldDisplay;
