import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 春联工坊",
  description: "输入主题，生成上联、下联、横批和解释",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
