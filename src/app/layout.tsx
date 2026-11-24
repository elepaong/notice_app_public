import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { StoreProvider } from "@/lib/store-provider";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "クレーム管理システム",
  description: "クレーム・インシデントの報告と承認、通知を管理するシステム",
  // iPhone：ホーム画面に追加するとアドレスバーなしで開く。ステータスバーは白いヘッダーに合わせて黒文字
  appleWebApp: {
    capable: true,
    title: "クレーム管理",
    statusBarStyle: "default",
  },
  // 金額や受付番号が電話番号リンクにならないように
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  // ノッチ・ホームバーの領域まで描画し、余白は CSS（safe-area）で確保する
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
