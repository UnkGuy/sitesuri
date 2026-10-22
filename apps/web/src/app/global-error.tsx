"use client";

import { useEffect } from "react";

/** Last-resort error UI: replaces the root layout, including ClerkProvider. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SiteSuri root layout error:", error);
  }, [error]);

  // Inline styles are deliberate: root-layout errors can interrupt loading
  // its fonts, Tailwind styles, context providers, or other shared resources.
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#ffffff",
          color: "#141414",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ padding: "28px 5%", fontSize: 22, fontWeight: 800 }}>
          <a href="/" style={{ color: "#141414", textDecoration: "none" }}>
            <span
              style={{
                display: "inline-block",
                background: "#FACC15",
                padding: "8px 12px",
                borderRadius: 12,
                marginRight: 8,
              }}
            >
              ◎
            </span>
            Site<span style={{ color: "#15803D" }}>Suri</span>
          </a>
        </div>
        <main
          style={{
            minHeight: "70vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "24px",
          }}
        >
          <span
            aria-hidden="true"
            style={{ fontSize: "clamp(96px, 22vw, 180px)", fontWeight: 900, color: "#F0F3F2", lineHeight: 1 }}
          >
            500
          </span>
          <h1 style={{ fontSize: "clamp(26px, 5vw, 38px)", margin: "24px 0 8px" }}>
            We lost our bearings.
          </h1>
          <p style={{ maxWidth: 480, color: "#66716C", lineHeight: 1.7 }}>
            Something went wrong. Try reloading, or return to the homepage.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 22 }}>
            <button
              onClick={reset}
              style={{
                cursor: "pointer",
                border: 0,
                borderRadius: 12,
                padding: "14px 24px",
                background: "#FACC15",
                color: "#141414",
                fontWeight: 700,
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                display: "inline-block",
                padding: "13px 24px",
                border: "1px solid #DDE4DB",
                borderRadius: 12,
                color: "#141414",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Return home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
