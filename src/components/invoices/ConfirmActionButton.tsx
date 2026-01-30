"use client";

import * as React from "react";
const { useCallback } = React;

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmTitle?: string;
  confirmText?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
};

export default function ConfirmActionButton({
  confirmTitle = "Are you sure?",
  confirmText = "This action can’t be undone.",
  confirmButtonText = "OK",
  cancelButtonText = "Cancel",
  onClick,
  ...props
}: Props) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      if (props.disabled) return;
      const ok = window.confirm(
        `${confirmTitle}\n\n${confirmText}\n\n[${confirmButtonText} / ${cancelButtonText}]`
      );
      if (!ok) {
        e.preventDefault();
        return;
      }
      if (onClick) onClick(e);
    },
    [
      props.disabled,
      confirmTitle,
      confirmText,
      confirmButtonText,
      cancelButtonText,
      onClick,
    ]
  );
  // NOTE: visual styles are intentionally inherited via props.className
  return (
    <button
      {...props}
      type={props.type || "button"}
      aria-disabled={props.disabled}
      onClick={handleClick}
    />
  );
}