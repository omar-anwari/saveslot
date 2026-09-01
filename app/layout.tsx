import type { Metadata } from "next";
import type { ReactNode } from "react";
import { env } from "@/lib/config/env";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: env.APP_NAME,
    template: `%s · ${env.APP_NAME}`,
  },
  description: "A personal, self-hosted retro game library.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}