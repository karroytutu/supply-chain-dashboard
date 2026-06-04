/**
 * 营业执照上传中间件单元测试
 * 补充 credit-upload.ts 的测试覆盖
 */

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('multer', () => {
  const multer = () => ({
    single: () => jest.fn(),
    array: () => jest.fn(),
  });
  multer.diskStorage = jest.fn();
  return multer;
});

import { getCreditLicenseUrl, resolveLicenseFilePath } from './credit-upload';

describe('credit-upload', () => {
  describe('getCreditLicenseUrl', () => {
    it('返回正确的文件访问 URL', () => {
      const url = getCreditLicenseUrl('license-123.jpg');
      expect(url).toBe('/uploads/credit-license/license-123.jpg');
    });

    it('处理含特殊字符的文件名', () => {
      const url = getCreditLicenseUrl('my license file.png');
      expect(url).toBe('/uploads/credit-license/my license file.png');
    });
  });

  describe('resolveLicenseFilePath', () => {
    it('从 URL 解析出文件系统绝对路径', () => {
      const fsPath = resolveLicenseFilePath('/uploads/credit-license/license-123.jpg');
      expect(fsPath).toContain('license-123.jpg');
      expect(fsPath).toContain('credit-license');
    });

    it('处理只有文件名的输入', () => {
      const fsPath = resolveLicenseFilePath('license-456.png');
      expect(fsPath).toContain('license-456.png');
    });
  });
});
