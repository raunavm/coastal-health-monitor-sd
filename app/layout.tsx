// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

// ✅ Client i18n provider (has "use client" inside)
import { I18nProvider } from "@/lib/i18n";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Coastal Health Monitor — San Diego",
  description:
    "AI-powered bilingual beach health and safety forecasts for San Diego’s coastlines.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* ✅ Wrap the entire app */}
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
