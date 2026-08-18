import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Sense Interview Simulator",
  description: "Practice calm, structured Product Sense interviews in a realistic video-call environment.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
