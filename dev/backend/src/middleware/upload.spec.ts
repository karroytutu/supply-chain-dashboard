import { getFileUrl } from './upload';

jest.mock('fs');
jest.mock('multer', () => {
  const multer = () => ({
    single: () => jest.fn(),
    array: () => jest.fn(),
  });
  multer.diskStorage = jest.fn();
  return multer;
});

describe('upload middleware', () => {
  describe('getFileUrl', () => {
    it('should return correct URL for filename', () => {
      const url = getFileUrl('test.jpg');
      expect(url).toBe('/uploads/ar-evidence/test.jpg');
    });

    it('should handle filename with spaces', () => {
      const url = getFileUrl('my file.png');
      expect(url).toBe('/uploads/ar-evidence/my file.png');
    });
  });
});
