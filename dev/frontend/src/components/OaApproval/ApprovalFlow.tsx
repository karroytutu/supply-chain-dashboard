import React from 'react';
import type { ApprovalFlowProps } from './flow-types';
import ApprovalFlowPreview from './ApprovalFlowPreview';
import ApprovalFlowActual from './ApprovalFlowActual';
import styles from './ApprovalFlow.less';

/** 审批流程统一组件，通过 mode 区分预览/实际模式 */
const ApprovalFlow: React.FC<ApprovalFlowProps> = (props) => {
  const isPreview = props.mode === 'preview';
  const containerClass = `${styles.approvalFlow} ${isPreview ? styles.previewMode : ''}`;

  return (
    <div className={containerClass}>
      {isPreview ? (
        <ApprovalFlowPreview
          workflowNodes={props.workflowNodes}
          formTypeCode={props.formTypeCode}
          fieldLabels={props.fieldLabels}
          formData={props.formData}
        />
      ) : (
        <ApprovalFlowActual
          nodes={props.nodes}
          ccUsers={props.ccUsers}
          currentStep={props.currentStep}
          instanceStatus={props.instanceStatus}
          actions={props.actions}
          erpMeta={props.erpMeta}
          instanceId={props.instanceId}
          applicantName={props.applicantName}
          applicantDept={props.applicantDept}
          applicantAvatar={props.applicantAvatar}
          submittedAt={props.submittedAt}
        />
      )}
    </div>
  );
};

export default ApprovalFlow;
