import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PwaManager } from "./components/PwaManager";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PwaManager />
  </StrictMode>,
);

// 첫 렌더가 그려진 뒤부터 사용자가 선택하는 테마 전환 효과를 허용합니다.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    delete document.documentElement.dataset.themeInitializing;
  });
});
