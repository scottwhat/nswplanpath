/**
 * Helpers for talking to the ArcGIS REST services in the layer registry.
 */

/**
 * Make a user-typed string safe to embed in an ArcGIS `where` clause.
 *
 * These services take raw SQL fragments, so the input is escaped rather than
 * parameterised: single quotes doubled, and the LIKE wildcards stripped so a
 * stray `%` cannot turn a fast prefix scan into a full-table one.
 */
export function escapeSqlLiteral(input: string): string {
  return input.replace(/'/g, "''").replace(/[%_\\[\]]/g, ' ')
}

/**
 * Normalise a typed address to the form the NSW address layer stores:
 * uppercase, "<number> <street> <suburb>", no punctuation, no state or postcode.
 */
export function normaliseAddressQuery(input: string): string {
  return input
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bNEW SOUTH WALES\b|\bNSW\b/g, ' ')
    .replace(/\b\d{4}\b\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
