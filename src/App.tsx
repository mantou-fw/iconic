import { useEffect } from "react";
import { initializeLocale } from "./lib/i18n";
import "./lib/resize-observer-fix";
import { ProjectWorkspace } from "@/components/project-workspace";

export function App() {
  useEffect(initializeLocale, []);
  return <ProjectWorkspace />;
}
export default App;
