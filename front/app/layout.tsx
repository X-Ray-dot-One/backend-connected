import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ModeProvider } from "@/contexts/mode-context";
import { AuthProvider } from "@/contexts/auth-context";
import { ShadowProvider } from "@/contexts/shadow-context";
import { MessagesProvider } from "@/contexts/messages-context";
import { ToastProvider } from "@/components/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "X-RAY",
  description: "Twitter-like social platform on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <ModeProvider>
            <ShadowProvider>
              <MessagesProvider>
                <ToastProvider>{children}</ToastProvider>
              </MessagesProvider>
            </ShadowProvider>
          </ModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
