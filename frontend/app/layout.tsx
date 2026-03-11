import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AccentProvider } from "@/components/accent-provider";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "PieChat - Secure, Decentralized Chat",
  description: "A professional chat platform powered by Matrix Protocol.",
  manifest: "/manifest.json",
  icons: {
    icon: "/PieChatIcon.png",
    apple: "/PieChatIcon.png",
    shortcut: "/PieChatIcon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PieChat",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0068ff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AccentProvider />
          {children}
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
