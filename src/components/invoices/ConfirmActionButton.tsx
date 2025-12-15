"use client";

import * as React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmTitle?: string;
  confirmText?: string;
};

export default function ConfirmActionButton({
  confirmTitle = "Are you sure?",
  confirmText = "This action can’t be undone.",
  onClick,
  ...props
}: Props) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (props.disabled) return;
        const ok = window.confirm(`${confirmTitle}\n\n${confirmText}`);
        if (!ok) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}