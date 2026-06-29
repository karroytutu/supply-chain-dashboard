/**
 * 字段控件分发器
 * 根据 field.type 分发到对应的统一控件组件
 * 每个控件通过 mode prop 切换只读/编辑，消除重复实现
 */
import React from 'react';
import { Typography } from 'antd';
import type { FieldControlProps } from './types';

import TextFieldControl from './TextFieldControl';
import NumberFieldControl from './NumberFieldControl';
import DateFieldControl from './DateFieldControl';
import SelectFieldControl from './SelectFieldControl';
import UploadFieldControl from './UploadFieldControl';
import SignatureFieldControl from './SignatureFieldControl';
import FormulaFieldControl from './FormulaFieldControl';
import PhotoFieldControl from './PhotoFieldControl';
import BankAccountFieldControl from './BankAccountFieldControl';
import TreeSelectModalControl from './TreeSelectModalControl';
import TableFieldControl from './TableFieldControl';

const { Text } = Typography;

const FieldControlDispatcher: React.FC<FieldControlProps> = (props) => {
  const { field } = props;

  // 特殊类型前置判断
  if (field.type === 'bank_account_selector') return <BankAccountFieldControl {...props} />;
  if (field.type === 'photo') return <PhotoFieldControl {...props} />;
  if (field.type === 'formula') return <FormulaFieldControl {...props} />;
  if (field.type === 'signature') return <SignatureFieldControl {...props} />;

  switch (field.type) {
    case 'text':
    case 'textarea':
      return <TextFieldControl {...props} />;
    case 'number':
    case 'money':
      return <NumberFieldControl {...props} />;
    case 'date':
    case 'date-range':
      return <DateFieldControl {...props} />;
    case 'select':
      return <SelectFieldControl {...props} />;
    case 'tree_select':
      return <TreeSelectModalControl {...props} />;
    case 'upload':
      return <UploadFieldControl {...props} />;
    case 'table':
      return <TableFieldControl {...props} />;

    default:
      // 未知类型降级：只读文本
      if (props.value === null || props.value === undefined || props.value === '') {
        return <Text type="secondary">-</Text>;
      }
      return <Text>{String(props.value)}</Text>;
  }
};

export default FieldControlDispatcher;

// Re-export types for external use
export type { FieldControlProps, FieldControlMode } from './types';
