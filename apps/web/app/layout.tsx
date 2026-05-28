import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CES Tech — Internal Operations',
  description: 'Projects, attendance, travel, expenses, reimbursements, DA, and project P&L.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        {children}
      </body>
    </html>
  );
}
