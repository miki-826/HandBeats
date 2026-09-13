import type { Metadata } from 'next';
import './globals.css';
import './blue-theme.css';
export const metadata: Metadata = {
  title: 'Hand Beat — その手で、音を掴め。',
  description: 'カメラに映る自分が、ゲームの主役。3つの手のジェスチャーで遊ぶリズムゲーム。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
