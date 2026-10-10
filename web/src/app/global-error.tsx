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
      <head>
        {/* The app stylesheet may not have loaded, so this page carries its own colours (light, plus system dark). */}
        <style>
          {
            "@media (prefers-color-scheme: dark){body{background:#131312!important;color:#ECEAE4!important}.ge-muted{color:#A6A298!important}.ge-button{background:#ECEAE4!important;color:#131312!important}}"
          }
        </style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#F7F6F2",
          color: "#1A1917",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div role="alert">
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500, fontSize: "1.75rem", lineHeight: 1.2 }}>
            CardAlarm hit a problem
          </h1>
          <p className="ge-muted" style={{ color: "#5E5A52" }}>
            Please try again in a moment.
          </p>
          <button
            type="button"
            className="ge-button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "1rem",
              minHeight: "2.75rem",
              padding: "0 1rem",
              borderRadius: 4,
              border: 0,
              background: "#1A1917",
              color: "#F7F6F2",
              fontFamily: "system-ui, sans-serif",
              fontSize: "0.875rem",
              fontWeight: 500,
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
