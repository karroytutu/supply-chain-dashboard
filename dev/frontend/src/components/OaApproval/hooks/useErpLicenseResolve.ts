/**
 * 解析 ERP 客户营业执照图片 URL
 * 优先使用 formData 中已存储的 _erpLicenseUrls（新提交的审批），
 * 若不存在则从 ERP API 动态获取（兼容历史数据）
 */
import { useState, useEffect } from 'react';
import type { FormSchema } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';

export function useErpLicenseResolve(
  formSchema: FormSchema | undefined,
  formData: Record<string, unknown> | undefined,
): { erpLicenseUrls: string[]; loading: boolean } {
  const [erpLicenseUrls, setErpLicenseUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!formSchema?.fields || !formData) {
      setErpLicenseUrls([]);
      setLoading(false);
      return;
    }

    // 第一优先级：formData 中已有 _erpLicenseUrls（beforeSubmit 注入）
    if (formData._erpLicenseUrls && Array.isArray(formData._erpLicenseUrls)) {
      setErpLicenseUrls(formData._erpLicenseUrls as string[]);
      setLoading(false);
      return;
    }

    // 第二优先级：判断是否有营业执照类型的 photo 字段（photoPurpose 为 license 或未定义）
    // 若所有 photo 字段都标记为 storefront，则不需要获取营业执照
    const hasCustomerField = formSchema.fields.some(f => f.type === 'erp_customer');
    const hasLicensePhotoField = formSchema.fields.some(
      f => f.type === 'photo' && (!f.photoPurpose || f.photoPurpose === 'license'),
    );
    if (!hasCustomerField || !hasLicensePhotoField) {
      setErpLicenseUrls([]);
      setLoading(false);
      return;
    }

    // 从 formData 中获取客户 ID，动态获取执照信息
    const customerId = Number(formData.customer);
    if (!customerId) {
      setErpLicenseUrls([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    oaApprovalApi.getCustomerLicenseInfo(customerId)
      .then((info) => {
        if (!cancelled) {
          setErpLicenseUrls(info.hasLicense ? info.attachedPicUrls : []);
        }
      })
      .catch(() => {
        // ERP 不可用时静默失败，不影响详情页展示
        if (!cancelled) {
          setErpLicenseUrls([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [formSchema, formData]);

  return { erpLicenseUrls, loading };
}
