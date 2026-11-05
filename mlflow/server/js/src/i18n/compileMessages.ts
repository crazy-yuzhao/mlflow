type CatalogEntry = { defaultMessage?: unknown };

/**
 * Turn a FormatJS catalog (`{ id: { defaultMessage } }`) or an already
 * flattened map (`{ id: "translated text" }`) into the `{ id: string }`
 * shape react-intl consumes.
 */
export function compileMessageCatalog(catalog: unknown): Record<string, string> {
  const compiled: Record<string, string> = {};
  if (!catalog || typeof catalog !== 'object') {
    return compiled;
  }

  for (const [id, value] of Object.entries(catalog as Record<string, unknown>)) {
    if (typeof value === 'string') {
      compiled[id] = value;
      continue;
    }
    if (value && typeof value === 'object' && typeof (value as CatalogEntry).defaultMessage === 'string') {
      compiled[id] = (value as { defaultMessage: string }).defaultMessage;
    }
  }

  return compiled;
}
