import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
const getNonce = createIsomorphicFn().server(() => getRequestHeader("x-iconic-csp-nonce")).client(() => undefined);
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, ssr: { nonce: getNonce() } });
}
declare module "@tanstack/react-router" {
  interface Register { router: ReturnType<typeof getRouter> }
}
