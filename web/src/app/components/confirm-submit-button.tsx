"use client";

import { useFormStatus } from "react-dom";

interface ConfirmSubmitButtonProps {
  children: React.ReactNode;
  message: string;
  className?: string;
}

/** Submit button that asks for confirmation before a destructive form action runs. */
export function ConfirmSubmitButton({ children, message, className }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
      {children}
    </button>
  );
}
