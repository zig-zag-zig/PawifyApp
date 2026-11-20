import { describe, expect, it } from "vitest";
import { getCountryDisplay } from "./countryDisplay";

describe("getCountryDisplay", () => {
  it("maps ISO country codes to flag and name", () => {
    expect(getCountryDisplay("us")).toEqual({
      code: "US",
      name: "United States",
      flag: "🇺🇸",
    });
  });

  it("maps MusicBrainz pseudo-countries explicitly", () => {
    expect(getCountryDisplay("XW")).toEqual({
      code: "XW",
      name: "Worldwide",
      flag: "🌐",
    });
    expect(getCountryDisplay("XE")).toEqual({
      code: "XE",
      name: "Europe",
      flag: "🇪🇺",
    });
  });

  it("falls back to the code for unknown values", () => {
    expect(getCountryDisplay("ZZ")).toEqual({
      code: "ZZ",
      name: "ZZ",
      flag: "🏳️",
    });
    expect(getCountryDisplay(null)).toBeNull();
  });
});
