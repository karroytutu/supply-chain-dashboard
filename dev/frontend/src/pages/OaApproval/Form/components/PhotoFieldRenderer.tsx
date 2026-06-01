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
  /** 照片用途：storefront=门头照，license=营业执照（默认 license） */
  photoPurpose?: 'license' | 'storefront';
  /** 当前已有照片 URL（门头照场景使用，来自 _storefrontPhotoUrl） */
  existingPhotoUrl?: string;
  customerLicenseInfo?: CustomerLicenseInfo | null;
  licenseLoading?: boolean;
}

/** 照片字段渲染组件（支持门头照和营业执照两种模式） */
const PhotoFieldRenderer: React.FC<PhotoFieldRendererProps> = ({
  value, onChange, maxCount, photoPurpose, existingPhotoUrl,
  customerLicenseInfo, licenseLoading,
}) => {
  const isStorefront = photoPurpose === 'storefront';

  return (
    <div>
      {/* ===== 门头照模式：展示当前门头照 ===== */}
      {isStorefront && existingPhotoUrl && (
        <div className={styles.existingLicense}>
          <div className={styles.existingLicenseTip}>
            <PaperClipOutlined /> 当前门头照
          </div>
          <div className={styles.existingLicenseImages}>
            <Image src={existingPhotoUrl} width={80} height={80}
              style={{ objectFit: 'cover', borderRadius: 4 }} />
          </div>
        </div>
      )}
      {isStorefront && !existingPhotoUrl && (
        <div className={styles.existingLicense}>
          <div className={styles.existingLicenseTip}>
            当前无门头照
          </div>
        </div>
      )}

      {/* ===== 营业执照模式：展示已有营业执照 ===== */}
      {!isStorefront && licenseLoading && (
        <div className={styles.existingLicense}>
          <Spin size="small" />
          <span style={{ marginLeft: 8, color: '#999' }}>正在获取营业执照信息...</span>
        </div>
      )}
      {!isStorefront && !licenseLoading && customerLicenseInfo?.hasLicense && customerLicenseInfo.attachedPicUrls.length > 0 && (
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
      {!isStorefront && !licenseLoading && customerLicenseInfo?.hasLicense && customerLicenseInfo.attachedPicUrls.length === 0 && (
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
      {!isStorefront && customerLicenseInfo?.hasLicense && !licenseLoading && (
        <div className={styles.uploadTip}>如需补充执照图片，可在上方上传（新图片将追加到已有执照中）</div>
      )}
    </div>
  );
};

export default PhotoFieldRenderer;
