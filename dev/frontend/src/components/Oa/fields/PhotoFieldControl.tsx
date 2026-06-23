/**
 * 图片字段统一控件（photo）
 * 始终只读展示，委托 PhotoFieldDisplay
 */
import React from 'react';
import PhotoFieldDisplay from '../PhotoFieldDisplay';
import type { FieldControlProps } from './types';

const PhotoFieldControl: React.FC<FieldControlProps> = ({ field, value, formData, erpLicenseUrls }) => {
  return <PhotoFieldDisplay field={field} value={value} formData={formData} erpLicenseUrls={erpLicenseUrls} />;
};

export default PhotoFieldControl;
