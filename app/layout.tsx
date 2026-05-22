import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustR.ing",
  description: "Sovereign Discovery and Recommendation Services for Nostr.",
  openGraph: {
    title: "TrustR.ing",
    description: "Sovereign Discovery and Recommendation Services for Nostr.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "TrustR.ing",
    description: "Sovereign Discovery and Recommendation Services for Nostr.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
