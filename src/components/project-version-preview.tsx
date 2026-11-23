import { useT } from "@/lib/i18n";
import type { ProjectFile } from "@/lib/project";

export function ProjectVersionPreview({ project, current }: { project: ProjectFile; current: ProjectFile }) {
  const t = useT();
  const byId = new Map(project.nodes.map(node => [node.id, node]));
  const placed = project.nodes.map(node => {
    let { x, y } = node.position;
    let parent = node.parentId;
    while (parent) {
      const owner = byId.get(parent);
      if (!owner) break;
      x += owner.position.x;
      y += owner.position.y;
      parent = owner.parentId;
    }
    return { id: node.id, type: node.type, x, y, w: node.width ?? 100, h: node.height ?? 60 };
  });
  const positions = new Map(placed.map(node => [node.id, node]));
  const left = placed.reduce((bound, node) => Math.min(bound, node.x), Infinity);
  const top = placed.reduce((bound, node) => Math.min(bound, node.y), Infinity);
  const right = placed.reduce((bound, node) => Math.max(bound, node.x + node.w), -Infinity);
  const bottom = placed.reduce((bound, node) => Math.max(bound, node.y + node.h), -Infinity);
  const metrics = [
    ["Devices", project.nodes.filter(node => node.type === "database").length, current.nodes.filter(node => node.type === "database").length],
    ["Cables", project.edges.length, current.edges.length],
    ["Room objects", project.roomItems?.length ?? 0, current.roomItems?.length ?? 0],
  ] as const;
  return <div className="mt-2 space-y-2 border-t border-[var(--hairline)] pt-2">
    {!!placed.length && <svg aria-label={t("Version thumbnail")} role="img" className="h-28 w-full rounded bg-[var(--canvas)]"
      viewBox={`${left - 20} ${top - 20} ${right - left + 40} ${bottom - top + 40}`}>
      {placed.filter(node => node.type === "zone").map(node => <rect key={node.id} x={node.x} y={node.y} width={node.w} height={node.h} fill="var(--muted)" stroke="currentColor" opacity={0.45} />)}
      {project.edges.map(edge => {
        const from = positions.get(edge.source), to = positions.get(edge.target);
        return from && to && <line key={edge.id} x1={from.x + from.w / 2} y1={from.y + from.h / 2} x2={to.x + to.w / 2} y2={to.y + to.h / 2} stroke="currentColor" vectorEffect="non-scaling-stroke" />;
      })}
      {placed.filter(node => node.type !== "zone").map(node => <rect key={node.id} x={node.x} y={node.y} width={node.w} height={node.h}
        rx={6} fill="var(--background)" stroke="currentColor" vectorEffect="non-scaling-stroke" />)}
    </svg>}
    <table className="w-full text-left text-xs">
      <thead><tr><th scope="col">{t("Drawing contents")}</th><th scope="col">{t("Current project")}</th><th scope="col">{t("Selected version")}</th></tr></thead>
      <tbody>{metrics.map(([label, before, after]) => <tr key={label}><th className="font-normal" scope="row">{t(label)}</th><td>{after}</td><td>{before}</td></tr>)}</tbody>
    </table>
  </div>;
}
