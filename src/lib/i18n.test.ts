import { describe, expect, test } from "vitest";
import { LOCALES, resolveLocale, translate } from "./i18n";
import { aiInstructions } from "./ai-instructions";
import en from "../locales/en.json";
import zh from "../locales/zh-Hant.json";
import ja from "../locales/ja.json";

describe("language preferences and complete catalogs", () => {
  test("resolves browser language variants with a predictable fallback", () => {
    expect(["zh-TW", "zh-HK", "zh-CN"].map(resolveLocale)).toEqual([
      "zh-Hant",
      "zh-Hant",
      "zh-Hant",
    ]);
    expect(resolveLocale("ja-JP")).toBe("ja");
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
  });
  test("all three languages cover every key with non-empty text", () => {
    for (const catalog of [zh, ja]) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      expect(
        Object.values(catalog).every((value) => value.trim().length > 0),
      ).toBe(true);
    }
    expect(translate("Equipment Rack", "ja")).toBe("機器ラック");
    expect(translate("Clear canvas", "zh-Hant")).toBe("清空畫布");
    expect(translate("custom device label", "ja")).toBe("custom device label");
  });
  test.each(LOCALES)(
    "instructions preserve commands, origin and canvas safety in %s",
    (language) => {
      const prompt = aiInstructions(
        "http://localhost:8765",
        "/a folder/pack",
        "codex",
        language,
      );
      expect(prompt).toContain(
        "http://localhost:8765/downloads/iconic-agent-pack.zip",
      );
      expect(prompt).toContain(
        "node scripts/setup-agent.mjs --agent codex --url http://localhost:8765 --with-skill --dry-run",
      );
      expect(prompt).toContain('"/a folder/pack"');
      expect(prompt).toContain("list_devices");
      expect(prompt).toContain("get_room");
      expect(prompt).toContain(translate("prompt.rules", language));
      expect(prompt).not.toContain("prompt.");
    },
  );
});
