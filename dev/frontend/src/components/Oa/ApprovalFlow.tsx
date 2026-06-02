import React from 'react';
import type { ApprovalFlowProps, ApprovalFlowPreviewProps, ApprovalFlowActualProps } from './flow-types';
import ApprovalFlowPreview from './ApprovalFlowPreview';
import ApprovalFlowActual from './ApprovalFlowActual';
import styles from './ApprovalFlow.less';

/** 审批流程统一组件，通过 mode 区分预览/实际模式 */
const ApprovalFlow: React.FC<ApprovalFlowProps> = (props) => {
  const isPreview = props.mode === 'preview';
  const containerClass = `${styles.approvalFlow} ${isPreview ? styles.previewMode : ''}`;

  return (
    <div className={containerClass}>
      {isPreview
        ? <ApprovalFlowPreview {...(props as ApprovalFlowPreviewProps)} />
        : <ApprovalFlowActual {...(props as ApprovalFlowActualProps)} />
      }
    </div>
  );
};

export default ApprovalFlow;
