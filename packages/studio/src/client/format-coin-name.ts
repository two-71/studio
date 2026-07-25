// Formats a host's coin display name for a given context (plan §8 item 4).
// `StudioClientConfig.coinName` is already the plural display label (e.g.
// "coins", set from `billing.coinName`) — the singular is derived by
// stripping a trailing "s", which covers the common case without the host
// needing to configure both forms separately.

interface FormatCoinNameOptions {
  /** Force the plural form. Ignored when `count` is provided. */
  plural?: boolean;
  /** Uppercase the first letter. */
  capitalize?: boolean;
  /** Prefix the formatted number and derive plural from it (singular when count === 1). */
  count?: number;
}

export function formatCoinName(
  coinNameLabel = "coins",
  options: FormatCoinNameOptions = {}
): string {
  const { capitalize = false, count } = options;
  const plural = count === undefined ? (options.plural ?? false) : count !== 1;
  const singular = coinNameLabel.endsWith("s")
    ? coinNameLabel.slice(0, -1)
    : coinNameLabel;

  let word = plural ? coinNameLabel : singular;
  if (capitalize) {
    word = word.charAt(0).toUpperCase() + word.slice(1);
  }

  return count === undefined ? word : `${count.toLocaleString()} ${word}`;
}
