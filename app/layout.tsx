import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Background } from "@/components/layout/Background";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Digmark V3.1",
  description: "Digital Marketing Command Center (migration of Digmark V3)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Layered gradient glow, painted once at root (spec B.5). */}
        <Background />
        {children}
      </body>
    </html>
  );
}