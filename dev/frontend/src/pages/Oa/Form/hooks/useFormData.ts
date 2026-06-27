/**
 * 审批表单数据加载 Hook
 * 包含表单类型加载、客户执照信息处理
 *
 * 架构说明：
 * - 内部辅助字段（_hasExistingLicense 等）写入 hiddenFieldsRef，由 Form 页面统一派生 formData
 * - 不再需要 setFormData，消除双数据源同步断裂风险
 */
import { useState, useRef, type MutableRefObject } from 'react';
import { message, type FormInstance } from 'antd';
import { history } from 'umi';
import { oaApi } from '@/services/api/oa';
import type { FormTypeDefinition } from '@/types/oa';
import type { CustomerLicenseInfo } from '../components/ErpFieldRenderer';
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
  hiddenFieldsRef: MutableRefObject<Record<string, unknown>>,
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

  /** 客户选中时提取执照信息，内部辅助字段写入 hiddenFieldsRef */
  const handleCustomerSelect = (licenseInfo: CustomerLicenseInfo | null) => {
    const licenseValue = licenseInfo?.hasLicense ? 'yes' : 'no';
    setCustomerLicenseInfo(licenseInfo);
    // 内部辅助字段：无 Form.Item，写入 hiddenFieldsRef 供 formData 派生
    hiddenFieldsRef.current._hasExistingLicense = licenseValue;
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
              hiddenFieldsRef.current._hasExistingLicense = 'no';
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
