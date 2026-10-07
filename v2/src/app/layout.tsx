import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'JIAN CHA · Rounds System', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}<div id="toast" className="toast" /></body>
    </html>
  );
}
