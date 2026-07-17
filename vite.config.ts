import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const repositoryName = "opic-speaking-trainer";

export default defineConfig(({ mode }) => ({
  // GitHub Pages 프로젝트 사이트는 저장소 이름을 base 경로로 사용합니다.
  // Vite preview도 command가 serve이므로 mode로 개발 서버만 구분합니다.
  base: mode === "development" ? "/" : `/${repositoryName}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: [
        "favicon.svg",
        "icons/apple-touch-icon.png",
        "icons/pwa-192x192.png",
        "icons/pwa-512x512.png",
        "icons/maskable-512x512.png",
      ],
      manifest: {
        id: ".",
        name: "OPIc Speaking Trainer",
        short_name: "OPIc Trainer",
        description: "영어 질문과 답변을 카드와 쉐도잉으로 연습하는 오픽 말하기 학습 앱",
        lang: "ko-KR",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#f3f5f8",
        theme_color: "#172c51",
        categories: ["education", "productivity"],
        icons: [
          {
            src: "icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
  ],
}));
