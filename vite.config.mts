import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import vercel from "./vercel.json";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const localPreview = command === "serve" && env.VITE_API_BASE_URL === "/backend";
  const preview = process.env.VERCEL_ENV === "preview" || localPreview;
  return {
    plugins: [react()],
    define: {
      "import.meta.env.XOCOMPASS_HOSTED_PREVIEW": JSON.stringify(preview && env.VITE_API_BASE_URL === "/backend"),
    },
    server: {
      port: 5173,
      proxy: localPreview ? {
        "/backend": {
          target: new URL(vercel.rewrites[0].destination).origin,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/backend(?=\/|$)/, ""),
        },
      } : undefined,
    },
  };
});
