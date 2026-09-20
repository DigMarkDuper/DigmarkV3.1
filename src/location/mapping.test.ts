import { describe, expect, it } from "vitest";
import { resolve, REGION_PROVINCE, CITY_PROVINCE } from "./mapping";
import { INDONESIA_PROVINCES } from "./indonesiaProvinces";

describe("REGION_PROVINCE / CITY_PROVINCE validity", () => {
  it("maps only to keys present in INDONESIA_PROVINCES", () => {
    for (const [region, province] of Object.entries({ ...REGION_PROVINCE, ...CITY_PROVINCE })) {
      expect(INDONESIA_PROVINCES[province], `${region} -> ${province}`).toBeDefined();
    }
  });
});

describe("resolve", () => {
  it("resolves the five core regions", () => {
    expect(resolve("Daerah Istimewa Yogyakarta")).toEqual({
      province: "Daerah Istimewa Yogyakarta",
      region: "Daerah Istimewa Yogyakarta",
      known: true,
    });
    expect(resolve("Jawa Tengah")).toMatchObject({ province: "Jawa Tengah", known: true });
    expect(resolve("Jawa Barat")).toMatchObject({ province: "Jawa Barat", known: true });
    expect(resolve("Jawa Timur")).toMatchObject({ province: "Jawa Timur", known: true });
    expect(resolve("DKI Jakarta")).toMatchObject({ province: "DKI Jakarta", known: true });
  });
  it("resolves DIY regencies to the special district", () => {
    for (const r of ["Sleman", "Bantul", "Kota Yogyakarta", "Kulon Progo", "Gunungkidul"]) {
      expect(resolve(r)).toMatchObject({ province: "Daerah Istimewa Yogyakarta", known: true });
    }
  });
  it("resolves Bandung and other cities", () => {
    expect(resolve("Bandung")).toMatchObject({ province: "Jawa Barat", known: true });
    expect(resolve("Makassar")).toMatchObject({ province: "Sulawesi Selatan", known: true });
    expect(resolve("Surakarta")).toMatchObject({ province: "Jawa Tengah", known: true });
    expect(resolve("Purworejo")).toMatchObject({ province: "Jawa Tengah", known: true });
  });
  it("returns known=false for unknown regions without inventing", () => {
    const r = resolve("ABC123");
    expect(r.known).toBe(false);
    expect(r.province).toBe("");
    expect(r.region).toBe("ABC123");
  });
});
