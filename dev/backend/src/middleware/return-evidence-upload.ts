import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 存储路径
const uploadDir = path.join(__dirname, '../../uploads/return-evidence');

// 确保目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// multer 存储配置
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `return-evidence-${uniqueSuffix}${ext}`);
  },
});

// 文件过滤
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传 jpg/jpeg/png 格式的图片'));
  }
};

// 导出上传中间件
export const uploadReturnEvidence = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 最大5MB
  },
});

/**
 * 获取文件访问URL
 * @param filename - 文件名
 * @returns 文件的访问URL路径
 */
export function getReturnEvidenceUrl(filename: string): string {
  return `/uploads/return-evidence/${filename}`;
}
