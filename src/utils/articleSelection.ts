export type ArticleSelectionToggleResult = {
  selectedIds: string[];
  hoverLockedIds: string[];
};

export function toggleArticleSelection(
  currentSelectedIds: string[],
  currentHoverLockedIds: string[],
  id: string,
  mode: string,
): ArticleSelectionToggleResult {
  if (mode === 'weak_point') {
    return { selectedIds: [id], hoverLockedIds: currentHoverLockedIds };
  }

  if (currentSelectedIds.includes(id)) {
    return {
      selectedIds: currentSelectedIds.filter((item) => item !== id),
      hoverLockedIds: Array.from(new Set([...currentHoverLockedIds, id])),
    };
  }

  return {
    selectedIds: [...currentSelectedIds, id],
    hoverLockedIds: currentHoverLockedIds.filter((item) => item !== id),
  };
}

export function toggleAllArticleSelection(
  articleIds: string[],
  currentSelectedIds: string[],
): ArticleSelectionToggleResult {
  const allSelected = articleIds.length > 0 && articleIds.every((id) => currentSelectedIds.includes(id));
  return allSelected
    ? { selectedIds: [], hoverLockedIds: [] }
    : { selectedIds: articleIds, hoverLockedIds: [] };
}

export function releaseArticleHoverLock(currentHoverLockedIds: string[], id: string): string[] {
  return currentHoverLockedIds.filter((item) => item !== id);
}
