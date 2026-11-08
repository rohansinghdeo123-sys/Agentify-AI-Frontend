import type { ChapterNotes } from "./api";

export function notesPageIndex(notes: ChapterNotes | null, requested: {page?: string | null; pageId?: string | null; version?: string | null} = {}) {
  const pages = notes?.pages || [];
  if (!pages.length) return 0;
  const versionChanged = Boolean(requested.version && notes?.content_version && requested.version !== notes.content_version);
  const pageId = versionChanged ? notes?.saved_page_id : requested.pageId || (!requested.page ? notes?.saved_page_id : undefined);
  const identified = pageId ? pages.findIndex(page=>page.id===pageId) : -1;
  if (identified >= 0) return identified;
  const value = Number(!versionChanged && requested.page !== null && requested.page !== undefined ? requested.page : notes?.saved_page || 0);
  return Math.max(0,Math.min(pages.length-1,Number.isFinite(value) ? Math.floor(value) : 0));
}

export function notesCompletedPageIds(notes: ChapterNotes | null) {
  const allowed = new Set((notes?.pages || []).map(page=>page.id));
  return [...new Set(notes?.completed_page_ids || [])].filter(id=>allowed.has(id));
}
