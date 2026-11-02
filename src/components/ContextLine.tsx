import { modelLabel } from '../../shared/context.ts';
import type { MessageContext } from '../../shared/types.ts';
import { useT, type Strings } from '../i18n.tsx';

/** "Opus 5.5 · high effort · Casual · WK 12 · Genki L6 · N4", leaving out what isn't set. */
export function contextParts(t: Strings, c: MessageContext): string[] {
  return [
    modelLabel(c.model),
    c.effort ? t.effortMeta(c.effort) : '',
    c.politeness === 'casual' ? t.casualShort : t.politeShort,
    t.wkMeta(c.wkLevel),
    c.genkiLesson > 0 ? t.genkiMeta(c.genkiLesson) : '',
    c.jlptLevel > 0 ? `N${c.jlptLevel}` : '',
  ].filter(Boolean);
}

export function ContextLine({ context, className = '', title }: { context: MessageContext; className?: string; title?: string }) {
  const t = useT();
  const text = contextParts(t, context).join(' · ');
  return (
    <div className={`context-line ${className}`} title={title ? `${title}\n${text}` : text}>
      {text}
    </div>
  );
}
