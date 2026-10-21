import { useT } from "../lib/i18n";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesheet from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "iconic" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: NotFound,
});

function NotFound() {
  const t = useT();
  return (
    <main className="p-8">
      <h1>{t("Page not found")}</h1>
      <a href="/">{t("Back to canvas")}</a>
    </main>
  );
}
