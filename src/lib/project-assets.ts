import { parseProject, type ProjectFile } from './project';
import { t } from './i18n';

/** Internal references never appear in portable JSON or in the renderer. */
export const ASSET_PREFIX = 'iconic-asset:sha256:';
export type ImageAsset = { id: string; source: string };
export type StoredProject = {
  encoding: 'asset-refs-v1' | 'original-json';
  payload: string;
  savedAt: string;
};
export type PreparedProject = { stored: StoredProject; assets: ImageAsset[] };
type Capture = {
  content: Omit<ProjectFile, 'savedAt'>;
  sources: { index: number; source: string }[];
  savedAt: string;
};

/** Freeze edits synchronously, without copying inline image strings into graph JSON. */
export function captureProject(project: ProjectFile): Capture {
  const sources: Capture['sources'] = [];
  const { savedAt, ...content } = project;
  if (savedAt !== undefined && typeof savedAt !== 'string') throw new Error(`${t('Invalid project field')} savedAt. Expected a string.`);
  const nodes = project.nodes.map((node, index) => {
    if (node?.type !== 'image' || typeof node.data?.src !== 'string') return node;
    // Leave invalid sources visible to the normal project validator instead of
    // accidentally legitimizing them by replacing them with a nonempty hash ID.
    if (!/\S/.test(node.data.src)) return node;
    sources.push({ index, source: node.data.src });
    return { ...node, data: { ...node.data, src: ASSET_PREFIX + 'pending' } };
  });
  return { content: structuredClone({ ...content, nodes }), sources, savedAt: savedAt ?? new Date().toISOString() };
}

/**
 * Hash exact source strings so the portable format remains lossless, including
 * data-URL spelling and existing external URLs. This does not fetch remote images.
 * The cache is bounded; one oversized current image is still worth retaining.
 */
export class ProjectAssetCodec {
  private hashes = new Map<string, { id: string; stored: boolean }>();
  private cacheBytes = 0;
  private remember(source: string, id: string, stored = false) {
    stored ||= this.hashes.get(source)?.stored === true;
    if (this.hashes.has(source)) this.hashes.delete(source);
    else this.cacheBytes += source.length * 2;
    this.hashes.set(source, { id, stored });
    while (this.hashes.size > 1 && (this.hashes.size > 64 || this.cacheBytes > 32 * 1024 * 1024)) {
      const oldest = this.hashes.keys().next().value!;
      this.cacheBytes -= oldest.length * 2;
      this.hashes.delete(oldest);
    }
  }

  async identify(source: string): Promise<string> {
    const cached = this.hashes.get(source);
    if (cached) { this.remember(source, cached.id); return cached.id; }
    // JSON escapes lone UTF-16 surrogates. Encoding the raw string would replace
    // distinct lone surrogates with U+FFFD and silently collapse different URLs.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(source)));
    const id = ASSET_PREFIX + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    this.remember(source, id);
    return id;
  }

  isStored({ id, source }: ImageAsset) {
    const cached = this.hashes.get(source);
    return cached?.id === id && cached.stored;
  }
  markStored({ id, source }: ImageAsset) { this.remember(source, id, true); }

  async prepare(captured: Capture): Promise<PreparedProject> {
    const assets = new Map<string, ImageAsset>();
    for (const { index, source } of captured.sources) {
      const id = await this.identify(source);
      if (assets.has(id) && assets.get(id)!.source !== source) throw new Error('Project data is missing.');
      captured.content.nodes[index]!.data.src = id;
      assets.set(id, { id, source });
    }
    // savedAt lives outside the content payload, so timestamp-only autosaves are
    // a single compact-string comparison, not two full-project parses/encodes.
    const payload = JSON.stringify(captured.content);
    parseProject(payload);
    return { stored: { encoding: 'asset-refs-v1', payload, savedAt: captured.savedAt }, assets: [...assets.values()] };
  }

  async migrate(payload: string): Promise<PreparedProject> {
    let project: ProjectFile;
    try { project = parseProject(payload); }
    catch {
      // Existing malformed/unsupported content must remain exportable verbatim.
      return { stored: { encoding: 'original-json', payload, savedAt: '' }, assets: [] };
    }
    return this.prepare(captureProject(project));
  }

  async hydrate(stored: StoredProject, load: (id: string) => Promise<string>): Promise<string> {
    if (stored.encoding === 'original-json') return stored.payload;
    if (stored.encoding !== 'asset-refs-v1') throw new Error('Project data is missing.');
    const content = JSON.parse(stored.payload) as Omit<ProjectFile, 'savedAt'>;
    const loaded = new Map<string, string>();
    for (const node of content.nodes) {
      if (node?.type !== 'image') continue;
      const id = node.data?.src;
      if (typeof id !== 'string' || !/^iconic-asset:sha256:[0-9a-f]{64}$/.test(id)) throw new Error('Project data is missing.');
      if (!loaded.has(id)) {
        const source = await load(id);
        if (await this.identify(source) !== id) throw new Error('Project data is missing.');
        loaded.set(id, source);
      }
      node.data.src = loaded.get(id)!;
    }
    return JSON.stringify({ ...content, savedAt: stored.savedAt });
  }

  clear() { this.hashes.clear(); this.cacheBytes = 0; }
}
