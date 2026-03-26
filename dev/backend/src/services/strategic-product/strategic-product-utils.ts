/**
 * 战略商品服务工具函数
 */

import { appQuery } from '../../db/appPool';

/**
 * 检查并更新确认状态
 * 当采购和营销双方都确认后，自动更新为已确认状态
 */
export async function checkAndUpdateConfirmedStatus(id: number): Promise<void> {
  await appQuery(
    `UPDATE strategic_products 
     SET status = 'confirmed', confirmed_at = NOW()
     WHERE id = $1 
       AND procurement_confirmed = TRUE 
       AND marketing_confirmed = TRUE 
       AND status = 'pending'`,
    [id]
  );
}
