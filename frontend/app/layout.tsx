import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Marco School', description: 'Gestión académica y administrativa' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
