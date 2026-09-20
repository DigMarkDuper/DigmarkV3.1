import { describe, expect, it } from "vitest";
import { clean, normalize, LOCATION_ALIASES } from "./normalizer";

describe("clean", () => {
  it("collapses whitespace, trims and lowercases", () => {
    expect(clean("  Yogyakarta ")).toBe("yogyakarta");
    expect(clean("  Jawa   Tengah  ")).toBe("jawa tengah");
  });
  it("handles null/undefined", () => {
    expect(clean(null)).toBe("");
    expect(clean(undefined)).toBe("");
  });
});

describe("normalize", () => {
  it("maps Jogja/Yogya/Kota Jogja/DIY/Yogyakarta to the special district", () => {
    for (const v of ["Jogja", "Yogya", "Kota Jogja", "DIY", "Yogyakarta"]) {
      expect(normalize(v)).toBe("Daerah Istimewa Yogyakarta");
    }
  });
  it("maps province abbreviations", () => {
    expect(normalize("Jateng")).toBe("Jawa Tengah");
    expect(normalize("Jatim")).toBe("Jawa Timur");
    expect(normalize("Jabar")).toBe("Jawa Barat");
    expect(normalize("Jakarta")).toBe("DKI Jakarta");
    expect(normalize("NTT")).toBe("Nusa Tenggara Timur");
    expect(normalize("Kalbar")).toBe("Kalimantan Barat");
    expect(normalize("Kalsel")).toBe("Kalimantan Selatan");
    expect(normalize("Kaltim")).toBe("Kalimantan Timur");
  });
  it("maps Solo to Surakarta and spelling variants", () => {
    expect(normalize("Solo")).toBe("Surakarta");
    expect(normalize("Puworejo")).toBe("Purworejo");
    expect(normalize("Purworjo")).toBe("Purworejo");
    expect(normalize("Padanng")).toBe("Padang");
    expect(normalize("Makasar")).toBe("Makassar");
    expect(normalize("Kulonprogo")).toBe("Kulon Progo");
    expect(normalize("Kulon Pro Go")).toBe("Kulon Progo");
    expect(normalize("Kulon Progp")).toBe("Kulon Progo");
    expect(normalize("Karwang")).toBe("Karawang");
    expect(normalize("Banjar Patroman")).toBe("Banjar");
  });
  it("is case/space-insensitive", () => {
    expect(normalize(" yogyakarta ")).toBe("Daerah Istimewa Yogyakarta");
    expect(normalize("YOGYAKARTA")).toBe("Daerah Istimewa Yogyakarta");
    expect(normalize("Yogyakarta")).toBe("Daerah Istimewa Yogyakarta");
    expect(normalize("JOGJA")).toBe("Daerah Istimewa Yogyakarta");
    expect(normalize("  Jateng  ")).toBe("Jawa Tengah");
  });
  it("returns '' for empty/null/nan/whitespace", () => {
    expect(normalize("")).toBe("");
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
    expect(normalize("   ")).toBe("");
    expect(normalize("NaN")).toBe("");
  });
  it("unknown non-empty value passes through cleaned", () => {
    expect(normalize("ABC123")).toBe("abc123");
  });
  it("dictionary is non-empty and extendable", () => {
    expect(Object.keys(LOCATION_ALIASES).length).toBeGreaterThan(50);
    expect(LOCATION_ALIASES["jogja"]).toBe("Daerah Istimewa Yogyakarta");
  });
});
