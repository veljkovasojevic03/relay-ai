import { ImageResponse } from "next/og";

// Home-screen icon for iOS (the browser tab uses icon.svg).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fbf7f2",
      }}
    >
      <svg width="132" height="132" viewBox="0 0 32 32" fill="none">
        <path
          d="M4 7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-4 3.5V16a3 3 0 0 1-3-3V7Z"
          fill="#b3472b"
        />
        <path
          d="M28 15a3 3 0 0 0-3-3h-2v1a5 5 0 0 1-5 5h-6v1a3 3 0 0 0 3 3h6l4 3.5V22a3 3 0 0 0 3-3v-4Z"
          fill="#e0913f"
        />
        <path
          d="M9 10h7m0 0-2.5-2.5M16 10l-2.5 2.5"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    size,
  );
}
