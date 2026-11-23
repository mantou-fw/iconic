import { createFeatureLoader } from "./feature-loader";

// Keep these imports literal: Vite emits local chunks that are also included in
// the portable server and Electron packages. No CDN or network service is used.
export const roomViewFeature = createFeatureLoader(() => import("../components/room-view"));
export const schedulesFeature = createFeatureLoader(() => import("./schedules"));
export const imageExportFeature = createFeatureLoader(() => import("./export-image"));
export const htmlExportFeature = createFeatureLoader(() => import("./export-html"));
