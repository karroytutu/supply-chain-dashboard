import React, { useEffect, useState } from 'react';
import { Avatar } from 'antd';
import type { AvatarProps } from 'antd/es/avatar';

interface UserAvatarProps extends Omit<AvatarProps, 'src' | 'children'> {
  name?: string;
  src?: string;
}

/**
 * 用户头像组件
 *
 * 支持图片头像和字母头像回退：
 * - 当 src 有效且图片加载成功时，显示图片头像
 * - 当 src 为空/图片加载失败时，显示纯色背景 + 用户名首字母
 * - 当 name 为空时，显示 "?"
 */
const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  src,
  ...avatarProps
}) => {
  const [imgError, setImgError] = useState(false);

  // src 变化时重置错误状态，允许重新加载新图片
  useEffect(() => {
    setImgError(false);
  }, [src]);

  const hasValidSrc = src && src.trim().length > 0;
  const showImage = hasValidSrc && !imgError;

  // 提取用户名首字母作为回退显示
  const firstChar = name && name.trim().length > 0 ? name.trim()[0] : '?';

  return (
    <Avatar
      {...avatarProps}
      src={showImage ? src : undefined}
      onError={() => {
        setImgError(true);
        return false;
      }}
    >
      {!showImage && firstChar}
    </Avatar>
  );
};

export default UserAvatar;
