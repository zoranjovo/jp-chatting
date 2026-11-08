import { modelLabel } from '../../shared/context.ts';
import type { MessageContext } from '../../shared/types.ts';
import { useT, type Strings } from '../i18n.tsx';

/** "Opus 5.5 · Effort: High · Casual · WK 12 · Genki L6 · N4", leaving out what isn't set (and the style, without `withStyle`). */
export function contextParts(t: Strings, c: MessageContext, withStyle = true): string[] {
  return [
    modelLabel(c.model),
    c.effort ? (c.provider === 'claude' ? t.effortMeta(c.effort) : t.thinkingMeta(c.effort)) : '',
    withStyle ? (c.politeness === 'casual' ? t.casualShort : t.politeShort) : '',
    t.wkMeta(c.wkLevel),
    c.genkiLesson > 0 ? t.genkiMeta(c.genkiLesson) : '',
    c.jlptLevel > 0 ? `N${c.jlptLevel}` : '',
  ].filter(Boolean);
}

export function ContextLine({
  context,
  className = '',
  title,
  withStyle = true,
}: {
  context: MessageContext;
  className?: string;
  title?: string;
  withStyle?: boolean;
}) {
  const t = useT();
  const text = contextParts(t, context, withStyle).join(' · ');
  return (
    <div className={`context-line ${className}`} title={title ? `${title}\n${text}` : text}>
      {text}
    </div>
  );
}
