export type CountryDisplay = {
  code: string;
  name: string;
  flag: string;
};

const SPECIAL_COUNTRIES: Record<string, { name: string; flag: string }> = {
  XW: { name: "Worldwide", flag: "🌐" },
  XE: { name: "Europe", flag: "🇪🇺" },
  XK: { name: "Kosovo", flag: "🇽🇰" },
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

const flagForCode = (code: string): string => {
  const special = SPECIAL_COUNTRIES[code];
  if (special) return special.flag;
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(
    ...code.split("").map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
  );
};

/**
 * Display metadata for a MusicBrainz release country.
 *
 * ISO alpha-2 codes get the regional-indicator flag; MusicBrainz pseudo-countries
 * (XW worldwide, XE Europe) get an explicit name and symbol instead of a broken
 * letter flag. Unknown codes fall back to the code itself.
 */
export const getCountryDisplay = (
  rawCode: string | null | undefined,
): CountryDisplay | null => {
  const code = rawCode?.trim().toUpperCase();
  if (!code) return null;

  const special = SPECIAL_COUNTRIES[code];
  if (special) {
    return { code, name: special.name, flag: special.flag };
  }

  let name = code;
  try {
    const resolved = regionNames?.of(code);
    if (
      resolved &&
      resolved !== code &&
      !/^Unknown (Region|Country)$/i.test(resolved)
    ) {
      name = resolved;
    }
  } catch {
    // Keep the code as the name.
  }

  return { code, name, flag: flagForCode(code) };
};
