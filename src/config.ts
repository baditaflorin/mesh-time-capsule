import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-time-capsule",
  description: "Write a note, set an unlock time, reveal in the future. Commit-reveal sealed.",
  accentHex: "#7faaff",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
