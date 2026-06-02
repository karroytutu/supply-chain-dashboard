/**
 * 审批表单数据加载 Hook
 * 包含表单类型加载、客户执照信息处理
 */
import { useState, useRef } from 'react';
import { message } from 'antd';
import { history } from 'umi';
import { oaApi } from '@/services/api/oa';
import type { FormTypeDefinition } from '@/types/oa';
import type { CustomerLicenseInfo } from '../components/ErpFieldRenderer';
import type { FormInstance } from 'antd';

interface UseFormDataReturn {
  loading: boolean;
  formType: FormTypeDefinition | null;
  customerLicenseInfo: CustomerLicenseInfo | null;
  licenseLoading: boolean;
  loadFormType: (code: string) => Promise<void>;
  handleCustomerSelect: (licenseInfo: CustomerLicenseInfo | null) => void;
}

export function useFormData(
  form: FormInstance,
  formData: Record<string, unknown>,
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
): UseFormDataReturn {
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<FormTypeDefinition | null>(null);
  const [customerLicenseInfo, setCustomerLicenseInfo] = useState<CustomerLicenseInfo | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const loadFormType = async (code: string) => {
    setLoading(true);
    try {
      const res = await oaApi.getFormType(code);
      setFormType(res.data);
    } catch (error) {
      message.error('加载表单类型失败');
      history.back();
    } finally {
      setLoading(false);
    }
  };

  /** 客户选中时提取执照信息，同步更新隐藏字段，并异步获取图片 URL */
  const handleCustomerSelect = (licenseInfo: CustomerLicenseInfo | null) => {
    const licenseValue = licenseInfo?.hasLicense ? 'yes' : 'no';
    setCustomerLicenseInfo(licenseInfo);
    setFormData(prev => ({ ...prev, _hasExistingLicense: licenseValue }));
    form.setFieldsValue({ _hasExistingLicense: licenseValue });

    if (!licenseInfo) {
      setLicenseLoading(false);
      return;
    }

    // 搜索 API 可能不返回 attachedPicUrls，需异步从详情 API 获取
    if (licenseInfo.hasLicense && licenseInfo.attachedPicUrls.length === 0) {
      const customerId = form.getFieldValue('customer');
      if (!customerId) return;

      fetchIdRef.current++;
      const currentFetchId = fetchIdRef.current;
      setLicenseLoading(true);

      oaApi.getCustomerLicenseInfo(Number(customerId))
        .then((fullInfo) => {
          if (fetchIdRef.current === currentFetchId) {
            setCustomerLicenseInfo(fullInfo);
            if (!fullInfo.hasLicense) {
              setFormData(prev => ({ ...prev, _hasExistingLicense: 'no' }));
              form.setFieldsValue({ _hasExistingLicense: 'no' });
            }
          }
        })
        .catch((err) => {
          console.warn('[FormPage] 获取客户执照信息失败:', err);
        })
        .finally(() => {
          if (fetchIdRef.current === currentFetchId) {
            setLicenseLoading(false);
          }
        });
    } else {
      setLicenseLoading(false);
    }
  };

  return {
    loading,
    formType,
    customerLicenseInfo,
    licenseLoading,
    loadFormType,
    handleCustomerSelect,
  };
}
