"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type PassthroughProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "className" | "children">;

interface SubmitButtonProps extends PassthroughProps {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}

/** Submit button that disables itself and announces progress while its form action runs. */
export function SubmitButton({ children, pendingLabel, className, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
