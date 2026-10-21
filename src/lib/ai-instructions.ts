import { translate, type Locale } from "./i18n";
export type AIClient = "codex" | "claude-code" | "generic";
/** Commands remain executable; the explanation follows the selected UI language. */
export function aiInstructions(
  origin: string,
  projectDirectory: string,
  client: AIClient = "codex",
  locale: Locale = "en",
) {
  const t = (key: string) => translate(key, locale);
  const directory = projectDirectory.trim();
  const install =
    client === "generic"
      ? `node scripts/setup-agent.mjs --agent generic --url ${origin}\n${t("prompt.generic")}`
      : `node scripts/setup-agent.mjs --agent ${client} --url ${origin} --with-skill --dry-run\n${t("prompt.review")}\nnode scripts/setup-agent.mjs --agent ${client} --url ${origin} --with-skill`;
  return `${t("prompt.intro")}

${directory ? t("Agent pack / project folder") + ": " + JSON.stringify(directory) : t("prompt.folder")}
${t("Download agent pack")}: ${origin}/downloads/iconic-agent-pack.zip
${t("Current canvas:")} ${origin}
${t("Your AI client")}: ${client}

${t("prompt.install")}
${install}
${t("prompt.after")}

${t("prompt.skill")}
npx skills@1.7.4 add . --skill av-schematic -a codex -a claude-code -g --copy

MCP (15): list_devices, add_zone, add_device, add_note, connect_devices, delete_device, auto_layout, add_rack, get_room, set_room, add_room_item, build_system, build_room, clear_canvas, clear_room

${t("prompt.rules")}

${t("prompt.exports")}

${t("prompt.report")}`;
}
