/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  turbopack: false,
  devIndicators: false,
  webpack: (config, { dev }) => {
    // 开发模式优化
    if (dev) {
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      };
      // 加快增量构建
      config.snapshot = {
        managedPaths: [],
      };
    }
    return config;
  },
};

export default config;
