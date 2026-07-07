/**
 * 审批表单数据加载 Hook
 * 包含表单类型加载、客户执照信息处理
 *
 * 内部辅助字段（_hasExistingLicense 等）通过 form.setFieldsValue 写入 form store，
 * 由 Form 页面 useWatch 自动捕获。
 */
import { useState, useRef } from 'react';
import { message, type FormInstance } from 'antd';
import { history } from 'umi';
import { oaApi } from '@/services/api/oa';
import type { FormTypeDefinition } from '@/types/oa';
import type { CustomerLicenseInfo } from '@/services/api/oa';
import { createLogger } from '../../../../utils/logger';
const log = createLogger('OaForm');

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

  /** 客户选中时提取执照信息，内部辅助字段写入 form store */
  const handleCustomerSelect = (licenseInfo: CustomerLicenseInfo | null) => {
    const licenseValue = licenseInfo?.hasLicense ? 'yes' : 'no';
    setCustomerLicenseInfo(licenseInfo);
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
              form.setFieldsValue({ _hasExistingLicense: 'no' });
            }
          }
        })
        .catch((err) => {
          log.warn('获取客户执照信息失败:', err);
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
