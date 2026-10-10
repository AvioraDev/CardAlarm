"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#07080b",
          color: "#f4f7fb",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div role="alert">
          <h1>CardAlarm hit a problem</h1>
          <p style={{ color: "#8b95a7" }}>Please try again in a moment.</p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1.5rem",
              borderRadius: 999,
              border: 0,
              background: "#37d67a",
              color: "#07080b",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
