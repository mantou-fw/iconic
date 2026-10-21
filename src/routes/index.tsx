import { useT } from "../lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The canvas owns IndexedDB and WebGL and must mount on the client only.
const Editor = lazy(() => import("../App"));
export const Route = createFileRoute("/")({
  ssr: false,
  component: EditorRoute,
});

function EditorRoute() {
  const t = useT();
  return (
    <Suspense fallback={<main className="p-8">{t("Opening canvas…")}</main>}>
      <Editor />
    </Suspense>
  );
}
