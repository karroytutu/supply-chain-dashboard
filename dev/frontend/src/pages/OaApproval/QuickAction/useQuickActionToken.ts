/**
 * OA审批快速操作 - Token验证与审批执行 Hook
 * 封装Token验证、状态管理、审批操作等逻辑
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'umi';
import { validateActionToken, executeActionByToken } from '@/services/api/oa-approval';

/** 页面状态机 */
export type PageState = 'loading' | 'confirm' | 'executing' | 'success' | 'expired' | 'error' | 'already_processed';

/** Token验证后的审批数据 */
export interface TokenData {
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  instanceStatus: string;
}

/** Token验证与审批执行 Hook */
export function useQuickActionToken() {
  const [searchParams] = useSearchParams();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryFlag, setRetryFlag] = useState(0);

  const token = searchParams.get('token') || '';
  const action = searchParams.get('action') || 'approve';

  useEffect(() => {
    if (!token) {
      setPageState('expired');
      return;
    }

    // 验证Token
    setPageState('loading');
    validateActionToken(token)
      .then((data) => {
        if (!data.valid) {
          setPageState('expired');
          return;
        }

        // 审批实例已不是待审批状态
        if (data.instanceStatus && !['pending', 'processing'].includes(data.instanceStatus)) {
          setTokenData({
            instanceId: data.instanceId!,
            instanceNo: data.instanceNo || '',
            title: data.title || '',
            formTypeName: data.formTypeName || '',
            instanceStatus: data.instanceStatus,
          });
          setPageState('already_processed');
          return;
        }

        setTokenData({
          instanceId: data.instanceId!,
          instanceNo: data.instanceNo || '',
          title: data.title || '',
          formTypeName: data.formTypeName || '',
          instanceStatus: data.instanceStatus || 'pending',
        });
        setPageState('confirm');
      })
      .catch(() => {
        setPageState('error');
        setErrorMsg('Token验证失败，请稍后重试');
      });
  }, [token, retryFlag]);

  /** 执行审批操作 */
  const handleConfirm = async () => {
    if (!token) return;
    setPageState('executing');

    try {
      await executeActionByToken(token, action as 'approve');
      setPageState('success');
    } catch (err: any) {
      setPageState('error');
      setErrorMsg(err.message || '操作失败');
    }
  };

  /** 重试（递增retryFlag触发useEffect重新验证） */
  const retry = () => setRetryFlag((f) => f + 1);

  return { pageState, tokenData, errorMsg, action, handleConfirm, retry };
}
