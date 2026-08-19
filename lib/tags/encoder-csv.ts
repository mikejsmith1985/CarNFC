// The file handed to whoever writes the physical tags.

/**
 * One row per tag: the identifier, and the address to write to it.
 *
 * Plain CSV because the thing at the other end is either a spreadsheet or an
 * encoder's import dialog, and both have understood this format for decades.
 * The identifier is carried alongside the address so a written tag can be
 * matched back to a batch without parsing a URL.
 */
export function buildEncoderCsv(tagIds: string[], appUrl: string): string {
  // A trailing slash here would write a broken link to every tag in the run.
  const base = appUrl.replace(/\/+$/, '')

  return ['tag_id,url', ...tagIds.map((tagId) => `${tagId},${base}/t/${tagId}`)].join('\n')
}
