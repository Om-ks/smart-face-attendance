import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartFace AI - Biometric Attendance & Face ID',
  description:
    'Edge AI Biometric Face Recognition & Attendance System running in-browser via WebAssembly and deep neural networks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
