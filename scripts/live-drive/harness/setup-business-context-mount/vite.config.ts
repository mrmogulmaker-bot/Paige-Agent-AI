import path from "node:path";
import { mergeConfig } from "vite";
import settingsConfig from "../settings-mount/vite.config";

// Isolated dev harness: never imported by the production application.
export default mergeConfig(settingsConfig, {
  resolve: {
    alias: [
      {
        find: "./data/useSoloBusinessContext",
        replacement: path.join(import.meta.dirname, "context-stub.ts"),
      },
    ],
  },
  server: { port: 5213 },
});
