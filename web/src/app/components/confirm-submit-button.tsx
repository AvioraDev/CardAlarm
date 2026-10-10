"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type PassthroughProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "className" | "children">;

interface ConfirmSubmitButtonProps extends PassthroughProps {
  children: React.ReactNode;
  message: string;
  className?: string;
}

/** Submit button that asks for confirmation before a destructive form action runs. */
export function ConfirmSubmitButton({ children, message, className, onClick, ...rest }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
      {children}
    </button>
  );
}
