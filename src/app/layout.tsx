import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Hand Beat — その手で、音を刻め。',
  description: 'カメラに映る自分が、ゲームの主役。4つの手のジェスチャーで遊ぶリズムゲーム。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
