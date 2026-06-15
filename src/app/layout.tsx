import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://arskin--arskinrx.us-east4.hosted.app";

const TITLE = "ARSkinRX — Virtual Skin Care Clinic | Arkansas";
const DESCRIPTION =
  "Online dermatology visits with licensed Arkansas nurse practitioners. Book, pay, and meet by video for acne, anti-aging, rosacea, hair, nail health, and more.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ARSkinRX",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "ARSkinRX",
    title: TITLE,
    description: DESCRIPTION,
    url: APP_URL,
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f6f6a",
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
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
