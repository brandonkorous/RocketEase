"use client";

import { AlertDialog, AlertDialogAction, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger, Button } from "@wizeworks/silicaui-react";

type Props = {
  trigger: React.ReactElement;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  color?: "error" | "primary" | "warning";
  onConfirm: () => void;
};

/** Replaces `window.confirm`: an AlertDialog whose confirm button runs `onConfirm`. */
export function ConfirmDialog({ trigger, title, description, confirmLabel = "Confirm", color = "error", onConfirm }: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-105">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description && <AlertDialogDescription className="mt-2 text-sm leading-relaxed text-secondary">{description}</AlertDialogDescription>}
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogClose><Button variant="ghost" color="neutral">Cancel</Button></AlertDialogClose>
          <AlertDialogAction color={color} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
