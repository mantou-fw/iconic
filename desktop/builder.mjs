import path from "node:path";

export function configuration({ platform, arch, version, afterPack }) {
  return {
    appId: "com.mantou.iconic",
    productName: "iconic",
    directories: { app: "desktop", output: path.join("release", `${platform}-${arch}`) },
    files: ["assets/*", "*.mjs", "package.json", "!**/*.test.*", "!node_modules/**/*"],
    extraMetadata: { version },
    extraResources: [{ from: ".output", to: "web" }],
    asar: true,
    npmRebuild: false,
    afterPack,
    mac: {
      icon: "desktop/assets/icon.icns",
      category: "public.app-category.graphics-design",
      identity: process.env.CSC_NAME ?? "-",
      hardenedRuntime: Boolean(process.env.CSC_NAME),
      entitlements: "desktop/entitlements.mac.plist",
      entitlementsInherit: "desktop/entitlements.mac.plist",
      notarize: false,
    },
    win: {
      icon: "desktop/assets/icon.ico",
      // PE resource editing uses Windows tools. Native Windows builds retain
      // metadata/icon editing; cross builds can make installers without Wine.
      signAndEditExecutable: process.platform === "win32",
    },
    nsis: { oneClick: false, allowToChangeInstallationDirectory: true, artifactName: "iconic-${version}-${arch}-Setup.${ext}" },
    publish: null,
  };
}
