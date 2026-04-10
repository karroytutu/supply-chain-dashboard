/**
 * 媒体查询 Hook
 * 用于响应式布局检测
 */
import { useState, useEffect } from 'react';

export interface MediaQueryState {
  isMobile: boolean;      // < 768px
  isTablet: boolean;      // 768px - 1024px
  isDesktop: boolean;     // >= 1024px
  isExtraSmall: boolean;  // < 480px
  width: number;
}

const useMedia = (): MediaQueryState => {
  const [state, setState] = useState<MediaQueryState>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isExtraSmall: false,
    width: 1024,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setState({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        isExtraSmall: width < 480,
        width,
      });
    };

    // 初始检测
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return state;
};

export default useMedia;
