-- 059: 客户授信营业执照后补上传 - 延期补交追踪表 + 表单schema更新

-- 延期补交追踪表：记录审批通过后未上传营业执照的授信申请
CREATE TABLE credit_license_deferred_uploads (
  id SERIAL PRIMARY KEY,
  oa_instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id),
  customer_id INTEGER NOT NULL,
  customer_name VARCHAR(200),
  applicant_id INTEGER NOT NULL REFERENCES users(id),
  applicant_name VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending/reminded/overdue/completed
  deadline TIMESTAMP NOT NULL,
  last_reminder_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(oa_instance_id)
);

CREATE INDEX idx_cldu_status_deadline ON credit_license_deferred_uploads(status, deadline);
CREATE INDEX idx_cldu_applicant_status ON credit_license_deferred_uploads(applicant_id, status);

-- 更新表单schema: 移除businessLicensePhotos的requiredWhen条件，改为完全可选
UPDATE oa_form_types
SET form_schema = jsonb_set(
  form_schema,
  '{fields}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'key' = 'businessLicensePhotos'
          THEN (elem - 'requiredWhen') || '{"placeholder":"审批通过后7天内可补交"}'::jsonb
        ELSE elem
      END
    )
    FROM jsonb_array_elements(form_schema->'fields') elem
  )
)
WHERE code = 'customer_credit';
