/**
 * Minimal .env parser (no dependency): KEY=VALUE lines, `#` comments,
 * optional `export ` prefix, single/double-quoted values (quotes stripped,
 * `\n` expanded inside double quotes). Matches what REST Client's
 * {{$dotenv}} supports.
 */
export function parseDotenv(text: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue!;
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replaceAll("\\n", "\n");
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) value = value.slice(0, commentIndex);
      value = value.trim();
    }
    variables[key!] = value;
  }
  return variables;
}
