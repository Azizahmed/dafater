import { ConfirmModal } from '@affine/component/ui/modal';
import { useI18n } from '@affine/i18n';
import { useCallback } from 'react';

export interface MemberLimitModalProps {
  /** @deprecated Dafater has no plans; ignored. */
  isFreePlan?: boolean;
  open: boolean;
  /** @deprecated Dafater has no plans; ignored. */
  plan?: string;
  quota: string;
  setOpen: (value: boolean) => void;
  onConfirm?: () => void;
}

/**
 * Shown when an invitation would exceed the workspace member limit set by the
 * Dafater server. Informational only: Dafater has no plans to upgrade to.
 */
export const MemberLimitModal = ({
  open,
  quota,
  setOpen,
  onConfirm,
}: MemberLimitModalProps) => {
  const t = useI18n();
  const handleConfirm = useCallback(() => {
    setOpen(false);
    onConfirm?.();
  }, [onConfirm, setOpen]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={setOpen}
      title={t['com.affine.payment.member-limit.title']()}
      description={t['com.affine.dafater.member-limit.description']({
        quota,
      })}
      confirmText={t['com.affine.payment.member-limit.pro.confirm']()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      cancelButtonOptions={{
        style: { visibility: 'hidden' },
      }}
      onConfirm={handleConfirm}
    ></ConfirmModal>
  );
};
