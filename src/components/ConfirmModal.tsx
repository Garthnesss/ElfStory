import React, { useEffect } from 'react';

/**
 * Phase 8 fix pack: a pending destructive-action confirmation. App holds
 * one of these in state; the guarded handler (onConfirm) runs only if the
 * player confirms through this modal. Replaces the last two native
 * window.confirm calls (new-game overwrite and save-slot delete), which
 * broke the game's own UI flow — and blocked headless automation entirely,
 * since a native dialog hangs the renderer.
 *
 * The component never calls pending.onConfirm itself: it calls the
 * onConfirm prop, and App's resolver consumes the pending action exactly
 * once (so the autoFocused button's Enter-click and this modal's own
 * Enter key handling can never double-fire it).
 */
export interface PendingConfirm {
  message: string;
  confirmLabel: string;
  /** Tints the confirm button red for irreversible actions (slot delete). */
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmModalProps {
  pending: PendingConfirm;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ pending, onConfirm, onCancel }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-3 sm:p-6"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm action"
    >
      <div
        className="w-full max-w-md rounded-md border border-amber-500/30 bg-[#10141D] p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-slate-200 leading-relaxed">{pending.message}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onCancel();
            }}
            className="min-h-[44px] px-4 py-2 rounded text-xs font-semibold border border-white/15 text-slate-200 hover:bg-white/8 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={(e) => {
              e.currentTarget.blur();
              onConfirm();
            }}
            className={`min-h-[44px] px-4 py-2 rounded text-xs font-semibold cursor-pointer ${
              pending.danger
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-amber-500 text-[#0B0D12] hover:bg-amber-400'
            }`}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
