export function getArticleChoiceClassName(opts: {
  selected: boolean;
  deselecting: boolean;
  hovered: boolean;
}): string {
  const classes = ['article-choice-box'];
  if (opts.selected) classes.push('active');
  if (opts.deselecting) classes.push('deselecting');
  if (!opts.selected && !opts.deselecting && opts.hovered) classes.push('hover-restored');
  return classes.join(' ');
}
