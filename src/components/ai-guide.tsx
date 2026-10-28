import { useLocale, useT } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";
import { aiInstructions, type AIClient } from "@/lib/ai-instructions";

export function AIGuide({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [directory, setDirectory] = useState("");
  const [client, setClient] = useState<AIClient>("codex");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prompt = aiInstructions(location.origin, directory, client, locale);
  useEffect(() => {
    copyRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("keydown", close, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onClose]);
  const copy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      promptRef.current?.focus();
      promptRef.current?.select();
      if (!document.execCommand("copy")) {
        setError(
          t("Text selected. Press ⌘C / Ctrl+C to copy, or download the guide."),
        );
        return;
      }
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([prompt], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "iconic-ai-instructions.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <aside
      className="ai-guide"
      aria-labelledby="ai-guide-title"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="ai-guide-header">
        <div>
          <h2 id="ai-guide-title">{t("AI guide")}</h2>
          <p>{t("Copy the prompt to your AI to set up MCP and the skill.")}</p>
        </div>
        <button
          className="ai-guide-icon"
          aria-label={t("Close AI guide")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="ai-guide-body">
        <label htmlFor="ai-client">{t("Your AI client")}</label>
        <select
          id="ai-client"
          className="ai-guide-client"
          value={client}
          onChange={(event) => {
            setClient(event.target.value as AIClient);
            setCopied(false);
          }}
        >
          <option value="codex">Codex</option>
          <option value="claude-code">Claude Code</option>
          <option value="generic">{t("Other MCP client")}</option>
        </select>
        <a
          className="ai-guide-pack"
          href="/downloads/iconic-agent-pack.zip"
          download
        >
          <Download size={16} /> {t("Download agent pack")}{" "}
          <span>{t("MCP + Skill + Installer")}</span>
        </a>
        <p className="ai-guide-note">
          {t(
            "Extract to a permanent folder and paste the prompt below into your AI. MCP dependencies are bundled; the skill installs through Vercel skills.",
          )}
        </p>
        <label
          className="ai-guide-directory-label"
          htmlFor="ai-project-directory"
        >
          {t("Agent pack / project folder")} <span>{t("(optional)")}</span>
        </label>
        <input
          id="ai-project-directory"
          value={directory}
          onChange={(event) => {
            setDirectory(event.target.value);
            setCopied(false);
          }}
          placeholder={t("Absolute path to the extracted folder")}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="ai-guide-prompt-heading">
          <label htmlFor="ai-setup-prompt">{t("Setup and usage prompt")}</label>
          <span>
            {t("Current canvas:")}
            {location.origin}
          </span>
        </div>
        <textarea
          id="ai-setup-prompt"
          ref={promptRef}
          readOnly
          value={prompt}
          spellCheck={false}
          aria-label={t("Copyable AI setup and usage prompt")}
        />
        <section
          className="ai-guide-features"
          aria-labelledby="ai-features-title"
        >
          <h3 id="ai-features-title">{t("What can AI do?")}</h3>
          <ul>
            <li>{t("Give your AI a product model or datasheet to create a device with ports and source references.")}</li>
            <li>{t("Attach room photos or a floor plan to your AI to generate a 3D layout. Unmeasured dimensions are marked as estimates.")}</li>
            <li>
              {t(
                "Read the canvas, create AV devices and zones, connect ports, and arrange the layout.",
              )}
            </li>
            <li>
              {t(
                "Build equipment racks, configure 3D rooms, and place devices and furniture.",
              )}
            </li>
            <li>
              {t(
                "Build entire systems in batches; delete or clear only when requested.",
              )}
            </li>
          </ul>
          <p>
            {t(
              "Use the app to export JSON projects and PNG / SVG / PDF / HTML / XLSX files. Exports are outside the MCP tools.",
            )}
          </p>
        </section>
        <section className="ai-guide-skill">
          <h3>{t("How do I use the skill?")}</h3>
          <p>
            {t("The installer uses Vercel skills to install the bundled")}{" "}
            <code>skills/av-schematic/SKILL.md</code>{" "}
            {t(
              "In Codex, ask to use $av-schematic. The skill also needs MCP setup; verify the connection before editing.",
            )}
          </p>
          <p>
            {t(
              "Example: Use av-schematic. Read the current canvas, then add a meeting-room AV system while preserving existing content.",
            )}
          </p>
        </section>
      </div>
      <footer className="ai-guide-footer">
        <p role="status">
          {error ||
            (copied
              ? t("Copied full prompt")
              : t(
                  "Paste into your AI and follow the installation and connection steps.",
                ))}
        </p>
        <div>
          <button className="ai-guide-download" onClick={download}>
            <Download size={15} /> {t("Download guide")}
          </button>
          <button
            ref={copyRef}
            className="ai-guide-copy"
            onClick={() => void copy()}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
            {copied ? t("Copied") : t("Copy full prompt")}
          </button>
        </div>
      </footer>
    </aside>
  );
}
