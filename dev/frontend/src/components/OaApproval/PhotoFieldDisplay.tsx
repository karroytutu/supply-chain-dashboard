import React, { useMemo, useState } from 'react';
import { Typography, Image } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import type { FormField } from '@/types/oa-approval';
import styles from './FormFieldRenderer.less';

const { Text } = Typography;

interface PhotoFieldDisplayProps {
  field: FormField;
  value: unknown;
  formData?: Record<string, unknown>;
  erpLicenseUrls?: string[];
}

/** 照片字段展示组件（审批详情只读模式，区分门头照/营业执照） */
const PhotoFieldDisplay: React.FC<PhotoFieldDisplayProps> = ({ field, value, formData, erpLicenseUrls }) => {
  const photos = Array.isArray(value)
    ? value as Array<{ uid?: string; name?: string; url?: string; thumbUrl?: string; status?: string }>
    : [];
  const [brokenLicenseUrls, setBrokenLicenseUrls] = useState<string[]>([]);
  const [brokenPhotoUrls, setBrokenPhotoUrls] = useState<string[]>([]);
  const isStorefront = field.photoPurpose === 'storefront';

  // ===== 门头照模式 =====
  if (isStorefront) {
    const existingUrl = formData?._storefrontPhotoUrl as string | undefined;
    const availablePhotos = photos.filter((photo) => {
      const src = photo.thumbUrl || photo.url;
      return !!src && !brokenPhotoUrls.includes(src);
    });
    const hasExisting = !!existingUrl;
    const hasUploaded = availablePhotos.length > 0;
    if (!hasExisting && !hasUploaded) return <Text type="secondary">-</Text>;
    return (
      <div className={styles.photoContainer}>
        <Image.PreviewGroup>
          {hasExisting && (
            <div className={styles.erpLicenseSection}>
              <div className={styles.erpLicenseTip}>
                <PaperClipOutlined /> 当前门头照
              </div>
              <div className={styles.erpLicenseImages}>
                <Image
                  src={existingUrl!}
                  width={60}
                  height={60}
                  style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8 }}
                  alt="门头照"
                  onError={() => setBrokenPhotoUrls((prev) => (prev.includes(existingUrl!) ? prev : [...prev, existingUrl!]))}
                />
              </div>
            </div>
          )}
          {hasUploaded && availablePhotos.map((photo, index) => {
            const src = photo.thumbUrl || photo.url;
            if (!src) return null;
            return (
              <Image
                key={photo.uid || index}
                src={src}
                width={60}
                height={60}
                style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8 }}
                alt={photo.name || '门头照'}
                preview={photo.url ? { src: photo.url } : undefined}
                onError={() => {
                  setBrokenPhotoUrls((prev) => (prev.includes(src) ? prev : [...prev, src]));
                }}
              />
            );
          })}
        </Image.PreviewGroup>
      </div>
    );
  }

  // ===== 营业执照模式（默认） =====
  const licenseUrls = (formData?._erpLicenseUrls && Array.isArray(formData._erpLicenseUrls) && (formData._erpLicenseUrls as string[]).length > 0)
    ? (formData._erpLicenseUrls as string[])
    : (erpLicenseUrls || []);
  const availableLicenseUrls = useMemo(
    () => licenseUrls.filter((url) => !brokenLicenseUrls.includes(url)),
    [brokenLicenseUrls, licenseUrls],
  );
  const availablePhotos = useMemo(
    () => photos.filter((photo) => {
      const src = photo.thumbUrl || photo.url;
      return !!src && !brokenPhotoUrls.includes(src);
    }),
    [brokenPhotoUrls, photos],
  );
  const hasUploaded = photos.length > 0;
  const hasErpLicense = availableLicenseUrls.length > 0;
  const hasAvailablePhotos = availablePhotos.length > 0;
  const hasBrokenOnly = !hasErpLicense && hasUploaded && !hasAvailablePhotos;
  if (!hasUploaded && !hasErpLicense) return <Text type="secondary">-</Text>;
  return (
    <div className={styles.photoContainer}>
      <Image.PreviewGroup>
        {hasErpLicense && (
          <div className={styles.erpLicenseSection}>
            <div className={styles.erpLicenseTip}>
              <PaperClipOutlined /> 客户档案已有营业执照（{availableLicenseUrls.length} 张）
            </div>
            <div className={styles.erpLicenseImages}>
              {availableLicenseUrls.map((url, idx) => (
                <Image
                  key={`erp-${idx}`}
                  src={url}
                  width={60}
                  height={60}
                  style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8 }}
                  alt="营业执照"
                  onError={() => {
                    setBrokenLicenseUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
                    return false;
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {hasAvailablePhotos && availablePhotos.map((photo, index) => {
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
              onError={() => {
                setBrokenPhotoUrls((prev) => (prev.includes(src) ? prev : [...prev, src]));
                return false;
              }}
            />
          );
        })}
      </Image.PreviewGroup>
      {hasBrokenOnly && (
        <Text type="secondary">该营业执照图片文件已失效或不存在，请补传后查看。</Text>
      )}
    </div>
  );
};

export default PhotoFieldDisplay;
