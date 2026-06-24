/**
 * 字段控件分发器
 * 根据 field.type 分发到对应的统一控件组件
 * 每个控件通过 mode prop 切换只读/编辑，消除重复实现
 */
import React from 'react';
import { Typography } from 'antd';
import { TABLE_ERP_TYPES } from '../hooks/useContainerWidth';
import type { FieldControlProps } from './types';

import TextFieldControl from './TextFieldControl';
import NumberFieldControl from './NumberFieldControl';
import DateFieldControl from './DateFieldControl';
import SelectFieldControl from './SelectFieldControl';
import UploadFieldControl from './UploadFieldControl';
import SignatureFieldControl from './SignatureFieldControl';
import FormulaFieldControl from './FormulaFieldControl';
import PhotoFieldControl from './PhotoFieldControl';
import UserFieldControl from './UserFieldControl';
import BankAccountFieldControl from './BankAccountFieldControl';
import ErpFieldControl from './ErpFieldControl';
import ModalSelectControl from './ModalSelectControl';
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
    case 'datetime':
    case 'date-range':
      return <DateFieldControl {...props} />;
    case 'select':
    case 'radio':
      return <SelectFieldControl {...props} />;
    case 'modal_select':
      return <ModalSelectControl {...props} />;
    case 'upload':
      return <UploadFieldControl {...props} />;
    case 'table':
      return <TableFieldControl {...props} />;
    case 'user':
    case 'dept':
      return <UserFieldControl {...props} />;
    default:
      // ERP 类型和其他以 erp_ 开头的类型
      if (TABLE_ERP_TYPES.has(field.type) || field.type.startsWith('erp_')) {
        return <ErpFieldControl {...props} />;
      }
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
