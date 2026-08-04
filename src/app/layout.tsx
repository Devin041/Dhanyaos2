import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from 'next-themes';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dhanya OS — AI Operating System for Dhanya Lifestyle LLP",
  description: "Enterprise ERP system for women's ethnic wear manufacturing. Elysé by Dhanya. Project Dhanya 2030.",
  keywords: ["Dhanya OS", "Elysé by Dhanya", "ERP", "Garment Manufacturing", "Ethnic Wear", "Fashion", "Dashboard"],
  authors: [{ name: "Dhanya Lifestyle LLP" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Dhanya OS — Enterprise Fashion ERP",
    description: "AI-driven operating system for Dhanya Lifestyle LLP — Women's ethnic wear manufacturing.",
    siteName: "Dhanya OS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dhanya OS — Enterprise Fashion ERP",
    description: "AI-driven operating system for Dhanya Lifestyle LLP.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster />
          <SonnerToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
