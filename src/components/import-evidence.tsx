import type { Provenance } from '@/lib/ai-imports';
import { useT } from '@/lib/i18n';

/** Source content stays in the author's language, including assumptions. */
export function ImportEvidence({ provenance, estimated }: { provenance: Provenance; estimated?: boolean }) {
  const t = useT();
  return (
    <details className="nodrag nopan border-b border-[var(--hairline)] px-2 py-1 text-[10px] text-muted-foreground">
      <summary className="cursor-pointer">{t(estimated ? 'Estimated from image' : 'AI import sources')}</summary>
      <p>{t('Confidence')}: {t(`confidence.${provenance.confidence}`)}</p>
      <ul className="list-disc space-y-1 pl-3">
        {provenance.sources.map((source, index) => (
          <li key={index} className="break-words">
            {source.uri && /^https?:\/\//i.test(source.uri)
              ? <a href={source.uri} target="_blank" rel="noreferrer" className="underline">{source.label}</a>
              : source.label}
            {source.excerpt && <p>{source.excerpt}</p>}
          </li>
        ))}
        {provenance.assumptions.map((assumption, index) => <li key={`a${index}`}>{assumption}</li>)}
      </ul>
    </details>
  );
}
