// A truncated or errored classifyRoles response returns {} — indistinguishable, until now, from
// "the model matched nothing". Key-present-with-null = a legitimate no-match. Key-absent = we
// never got an answer for that section. This distinguishes them.
export function isCoverageComplete(
  sectionNames: string[],
  roleMap: Record<string, string | null>
): boolean {
  return sectionNames.every((n) => Object.prototype.hasOwnProperty.call(roleMap, n))
}
