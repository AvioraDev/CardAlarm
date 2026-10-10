"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}

/** Submit button that disables itself and announces progress while its form action runs. */
export function SubmitButton({ children, pendingLabel, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
