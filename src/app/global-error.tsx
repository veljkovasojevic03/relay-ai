"use client";

// Last resort, when the root layout itself fails: no fonts, styles or translations are
// available here, so it is plain, inline-styled and bilingual.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf8f5",
          color: "#1c1917",
        }}
      >
        <title>Relay AI</title>
        <main style={{ maxWidth: "32rem", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Something went wrong</h1>
          <p lang="sr" style={{ margin: "0 0 1.25rem", color: "#57534e" }}>
            Nešto nije u redu. Pokušaj ponovo za trenutak.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #1c1917",
              background: "#1c1917",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again · Pokušaj ponovo
          </button>
        </main>
      </body>
    </html>
  );
}
