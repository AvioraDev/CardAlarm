"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/app/components/error-panel";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPanel
      title="Something went wrong"
      message="We couldn't load this page. Your watchlists and saved cards are safe. Try again in a moment."
      onRetry={() => unstable_retry()}
    />
  );
}
