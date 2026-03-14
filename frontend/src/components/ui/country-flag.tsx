import { getCountryCode } from "@/lib/data/countries";
import "flag-icons/css/flag-icons.min.css";

interface CountryFlagProps {
  country: string;
  className?: string;
}

/**
 * Renders a country flag using the flag-icons CSS library.
 * Works reliably across all platforms including Windows.
 */
export function CountryFlag({ country, className = "" }: CountryFlagProps) {
  const code = getCountryCode(country);
  if (!code) return null;
  return <span className={`fi fi-${code} ${className}`} />;
}
