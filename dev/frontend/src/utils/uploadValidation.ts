import { message, Upload } from 'antd';
import type { RcFile } from 'antd/es/upload/interface';

/** 文档扩展名白名单 */
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

/** 默认文件大小 5MB */
const DEFAULT_MAX_SIZE_MB = 5;

/**
 * 验证图片文件（类型 + 大小）
 * 用于：PhotoFieldRenderer, SupplementLicenseModal 等纯图片场景
 * @returns true 验证通过，false 验证失败
 */
export function validateImageFile(
  file: RcFile,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
): boolean {
  if (!file.type?.startsWith('image/')) {
    message.error('仅支持上传图片文件');
    return false;
  }
  if (file.size / 1024 / 1024 >= maxSizeMB) {
    message.error(`图片大小不能超过 ${maxSizeMB}MB`);
    return false;
  }
  return true;
}

/**
 * 验证文档文件（图片 + 常见办公文档，类型 + 大小）
 * 用于：催收/法律相关附件、OA 表单附件、考核申诉附件
 * @returns true 验证通过，false 验证失败
 */
export function validateDocumentFile(
  file: RcFile,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
): boolean {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  const isImage = file.type?.startsWith('image/');
  const isDoc = DOC_EXTENSIONS.includes(ext);

  if (!isImage && !isDoc) {
    message.error('仅支持图片和文档文件（pdf/doc/docx/xls/xlsx）');
    return false;
  }
  if (file.size / 1024 / 1024 >= maxSizeMB) {
    message.error(`文件大小不能超过 ${maxSizeMB}MB`);
    return false;
  }
  return true;
}

/**
 * 生成 beforeUpload 回调：验证通过后返回 false 阻止自动上传
 * 用于"随表单手动提交"的 Upload 组件
 */
export function createBeforeUpload(
  validator: (file: RcFile) => boolean,
): (file: RcFile) => false | typeof Upload.LIST_IGNORE {
  return (file: RcFile) => {
    if (!validator(file)) return Upload.LIST_IGNORE;
    return false;
  };
}
