import type { CSSProperties, ReactNode } from 'react';

type MarkedTextProps = {
  text?: string;
  className?: string;
  style?: CSSProperties;
};

export function MarkedText({ text = '', className, style }: MarkedTextProps) {
  return <span className={className} style={style}>{renderMarkedText(text)}</span>;
}

export function renderMarkedText(text: string): ReactNode[] {
  const normalized = markQuotedAddedWords(text || '');
  const nodes: ReactNode[] = [];
  const pattern = /《([^《》]+)》/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized))) {
    if (match.index > last) nodes.push(normalized.slice(last, match.index));
    nodes.push(<span key={`${match.index}-${match[1]}`} className="added-dot">{match[1]}</span>);
    last = match.index + match[0].length;
  }
  if (last < normalized.length) nodes.push(normalized.slice(last));
  return nodes;
}

function markQuotedAddedWords(text: string) {
  return text
    .replace(/加点(?:词|字|词语)[“"]([^”"]+)[”"]/g, '加点词《$1》')
    .replace(/加点(?:词|字|词语)[‘']([^’']+)[’']/g, '加点词《$1》');
}
