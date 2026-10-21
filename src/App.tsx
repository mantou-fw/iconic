import { useEffect } from "react";
import { initializeLocale } from "./lib/i18n";
import "./lib/resize-observer-fix";
import { Canvas } from "@/components/canvas";

export function App() {
  useEffect(initializeLocale, []);
  return <Canvas />;
}
export default App;
