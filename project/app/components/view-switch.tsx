import { Link, useLocation } from "react-router";

/**
 * A link to this page with one search parameter changed, keeping the others
 * except `drop` (parameters that belong to the visit they came with).
 */
export function useSwitch(drop: string[] = []): (name: string, value: string | null) => string {
  const location = useLocation();
  return (name, value) => {
    const search = new URLSearchParams(location.search);
    for (const parameter of drop) search.delete(parameter);
    if (value === null) search.delete(name);
    else search.set(name, value);
    const query = search.toString();
    return query ? `?${query}` : ".";
  };
}

/** Two or more ways to show the same thing (Calendar / List), as links that keep the scroll. */
export function Switch({
  label,
  options,
}: {
  label: string;
  options: { text: string; to: string; current: boolean }[];
}) {
  return (
    <nav className="view-switch" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.text}
          to={option.to}
          replace
          preventScrollReset
          className={option.current ? "current" : undefined}
          aria-current={option.current ? "page" : undefined}
        >
          {option.text}
        </Link>
      ))}
    </nav>
  );
}
