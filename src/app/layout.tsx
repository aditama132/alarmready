import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlarmReady",
  description: "Public hackathon prototype for solar alarm decision support."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
