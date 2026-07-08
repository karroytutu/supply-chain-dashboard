/**
 * 固定资产维修流程 - auto 节点回调处理器
 * 节点5(创建费用单): 调用 ERP 创建维修费用单 (subjectId=412)
 * @module services/fixed-asset/maintenance-callback
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('FixedAsset');

import type { OaInstanceRow, CallbackResult } from '../oa/oa.types';
import type { FormAccessor } from '../oa/form-accessor';
import { getErpStaff } from './fixed-asset.query';
import { getErpMeta, updateErpMetaStatus, markErpFailed } from './erp-meta-utils';
import { erpPost, getErpConfig, getErpDefaults, type ErpBillResponse } from '../erp-client';
import { FEE_SUBJECT } from './fixed-asset.types';
import { randomUUID } from 'crypto';
import { normalizeDateTime } from './fixed-asset-utils';

/**
 * 维修流程 — auto 节点回调
 * 由框架通过 executeAutoNodeCallback 触发，回填由 nodeBackfills 声明驱动
 */
export async function handleMaintenanceAutoNode(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<CallbackResult> {
  try {
    await updateErpMetaStatus(instance.id, 'paying');

    const paymentAmount = form.getString('paymentAmount') ?? '0';
    const paymentSubjectId = form.getNumber('paymentSubjectId');
    const paymentDate = normalizeDateTime(form.getString('paymentDate') ?? '');

    // 获取申请人舟谱信息
    const { defaultSalesmanId, defaultDeptId, cid, uid, defaultPaymentSubjectId } =
      getErpDefaults();
    const staff = await getErpStaff();
    const applicant = staff.find(s => s.name === instance.applicant_name);
    const salesmanId = applicant?.id || defaultSalesmanId;
    const deptId = applicant?.deptId || defaultDeptId;

    // 获取 APA 编号
    const erpMeta = getErpMeta(instance);
    const applicationNo = erpMeta?.applicationNo || instance.instance_no;

    const requestBody = {
      operatorId: '1',
      operateTime: paymentDate,
      paymentDetails: [
        {
          paymentAmount,
          subjectId: paymentSubjectId || defaultPaymentSubjectId,
        },
      ],
      totalAmount: paymentAmount,
      details: [
        {
          id: randomUUID(),
          subjectId: FEE_SUBJECT.MAINTENANCE.subjectId,
          subjectName: FEE_SUBJECT.MAINTENANCE.subjectName,
          salesmanId,
          salesmanName: instance.applicant_name || '',
          deptId,
          taxRadio: 0,
          taxAmount: '',
          noTaxAmount: paymentAmount,
          paymentAmount,
        },
      ],
      imgIds: [],
      workTime: paymentDate,
      salesmanId,
      note: `鑫链云维修申请 ${applicationNo}`,
      deptId,
      cid,
      uid,
    };

    const config = getErpConfig();

    const result = await erpPost<ErpBillResponse>(config.expenditureBillPath, requestBody, {
      pathPrefix: '/saas/pro/',
      businessType: 'fixed_asset_maintenance_payment',
      businessId: instance.id,
    });

    const billData = result?.data as ErpBillResponse | undefined;

    await updateErpMetaStatus(instance.id, 'completed');

    log.info(`维修费用单创建成功: billStr=${billData?.billStr}`);

    // 返回结构化结果，框架根据 nodeBackfills 声明自动执行回填
    return {
      erpMeta: {
        expenditureBillId: billData?.id,
        expenditureBillStr: billData?.billStr,
      },
      formData: {
        _expenditureBillStr: billData?.billStr,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`维修费用单创建失败:`, message);
    await markErpFailed(instance.id, { error: message, node: 'maintenance_payment' });
    throw error;
  }
}
