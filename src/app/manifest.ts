import type { MetadataRoute } from "next";

/** ホーム画面に追加したとき、アプリのように開くための設定 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "クレーム管理システム",
    short_name: "クレーム管理",
    description: "クレーム・インシデントの報告と承認、通知を管理するシステム",
    lang: "ja",
    start_url: "/claims",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
