import { z } from "zod";
import { parseProject } from "./project";

const project = z.unknown().transform(value => parseProject(JSON.stringify(value)));
const version = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  label: z.string(),
  createdAt: z.string(),
  reason: z.enum(["initial", "manual", "before-restore", "restore"]),
  sourceVersion: z.string(),
  project,
});
const archiveSchema = z.object({
  kind: z.literal("iconic-project-archive"),
  version: z.literal(1),
  name: z.string().trim().min(1).max(200),
  current: project,
  history: z.array(version).min(1),
}).superRefine((archive, context) => {
  const ids = new Set<string>();
  const numbers = new Set<number>();
  archive.history.forEach((entry, index) => {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", path: ["history", index, "id"], message: "Duplicate version ID." });
    if (numbers.has(entry.number)) context.addIssue({ code: "custom", path: ["history", index, "number"], message: "Duplicate version number." });
    ids.add(entry.id);
    numbers.add(entry.number);
  });
});

export type ProjectArchive = z.infer<typeof archiveSchema>;

export function parseProjectArchive(contents: string): ProjectArchive {
  return archiveSchema.parse(JSON.parse(contents));
}
