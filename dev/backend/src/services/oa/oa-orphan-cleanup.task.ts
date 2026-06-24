/**
 * OA 附件孤儿文件清理任务
 * 扫描 uploads/oa-attachment/ 和 uploads/oa-statement/ 目录，
 * 删除未被任何审批实例引用且超过7天的文件
 */
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../utils/logger';
import { appQuery } from '../../db/appPool';

const log = createLogger('OaOrphanCleanup');

/** 孤儿文件保留天数（超过此天数且未被引用则删除） */
const ORPHAN_RETENTION_DAYS = 7;

/** 需要清理的附件子目录列表 */
const UPLOAD_SUBDIRS = ['oa-attachment', 'oa-statement'] as const;

/** 分批查询大小 */
const BATCH_SIZE = 500;

/**
 * 执行孤儿文件清理
 * @returns 清理统计信息
 */
export async function runOaOrphanCleanup(): Promise<{
  totalFiles: number;
  referencedFiles: number;
  deletedFiles: number;
  freedBytes: number;
}> {
  const uploadsBase = path.join(__dirname, '../../../uploads');

  // 1. 分批查询所有审批实例 form_data 中被引用的附件 URL
  const referencedUrls = new Set<string>();
  let offset = 0;

  while (true) {
    const batch = await appQuery(
      `SELECT form_data FROM oa_approval_instances
       WHERE form_data IS NOT NULL
       ORDER BY id LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );
    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      extractOaUrls(row.form_data, referencedUrls);
    }
    offset += BATCH_SIZE;
  }

  // 2. 将 URL 转换为按目录分组的文件名集合
  //    URL 格式: /uploads/oa-attachment/filename 或 /uploads/oa-statement/filename
  const referencedByDir = new Map<string, Set<string>>();
  for (const subdir of UPLOAD_SUBDIRS) {
    referencedByDir.set(subdir, new Set());
  }
  for (const url of referencedUrls) {
    for (const subdir of UPLOAD_SUBDIRS) {
      const prefix = `/uploads/${subdir}/`;
      if (url.includes(prefix)) {
        const filename = url.split('/').pop();
        if (filename) referencedByDir.get(subdir)!.add(filename);
        break;
      }
    }
  }

  // 3. 遍历各目录，找出孤儿文件并删除
  const cutoffTime = Date.now() - ORPHAN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let totalFiles = 0;
  let totalReferenced = 0;
  let deletedCount = 0;
  let freedBytes = 0;

  for (const subdir of UPLOAD_SUBDIRS) {
    const dirPath = path.join(uploadsBase, subdir);
    if (!fs.existsSync(dirPath)) {
      log.info(`目录 ${subdir} 不存在，跳过`);
      continue;
    }

    const allFiles = fs.readdirSync(dirPath);
    if (allFiles.length === 0) continue;

    const referencedFilenames = referencedByDir.get(subdir)!;
    totalFiles += allFiles.length;
    totalReferenced += referencedFilenames.size;

    for (const filename of allFiles) {
      if (referencedFilenames.has(filename)) continue; // 被引用，保留

      const filePath = path.join(dirPath, filename);
      try {
        const stat = fs.statSync(filePath);
        // 仅删除超过保留天数的文件
        if (stat.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
          freedBytes += stat.size;
        }
      } catch (err) {
        log.error(`处理文件 ${subdir}/${filename} 时出错:`, err);
      }
    }
  }

  const summary = {
    totalFiles,
    referencedFiles: totalReferenced,
    deletedFiles: deletedCount,
    freedBytes,
  };

  if (deletedCount > 0) {
    const freedMB = (freedBytes / 1024 / 1024).toFixed(2);
    log.info(
      `孤儿文件清理完成: 共 ${summary.totalFiles} 个文件, ` +
      `${summary.referencedFiles} 个被引用, ` +
      `删除 ${deletedCount} 个孤儿文件, 释放 ${freedMB}MB`
    );
  } else {
    log.info(`孤儿文件清理完成: 共 ${summary.totalFiles} 个文件, 无需清理`);
  }

  return summary;
}

/**
 * 递归从 JSON 对象中提取所有包含 /uploads/oa-attachment/ 或 /uploads/oa-statement/ 的 URL 字符串
 */
function extractOaUrls(obj: unknown, urls: Set<string>): void {
  if (!obj) return;

  if (typeof obj === 'string') {
    if (obj.includes('/uploads/oa-attachment/') || obj.includes('/uploads/oa-statement/')) {
      urls.add(obj);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractOaUrls(item, urls);
    }
    return;
  }

  if (typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      extractOaUrls(value, urls);
    }
  }
}
