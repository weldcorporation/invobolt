import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Invobolt — Invoices in a bolt",
  description:
    "Free, open-source invoice generator. Create and export a professional invoice in seconds — no login, no signup. VAT-ready, multi-currency, private by default.",
  applicationName: "Invobolt",
  authors: [{ name: "Invobolt" }],
  keywords: [
    "invoice generator",
    "free invoice",
    "VAT invoice",
    "PDF invoice",
    "open source",
    "no signup",
  ],
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Invobolt — Invoices in a bolt",
    description:
      "Free, open-source invoice generator. Create a professional invoice in seconds — no login.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
