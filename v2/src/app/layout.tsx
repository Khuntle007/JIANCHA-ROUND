import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'JIANCHA · ระบบรอบสั่ง–รอบส่ง', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=Montserrat:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}<div id="toast" className="toast" /></body>
    </html>
  );
}
