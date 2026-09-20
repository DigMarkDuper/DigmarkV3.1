import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsiteDashboard } from "@/workspaces/WebsiteDashboard";
import {
  deriveWebsiteStats,
  websiteMonths,
  pendingByPillar,
  pillarStats,
} from "@/workspaces/website";
import type { Row } from "@/server/adapter/source";

const DEADLINE = "Deadline";

function row(partial: Partial<Row> & { deadline: string }): Row {
  return { ...partial, [DEADLINE]: partial.deadline };
}

const FIXTURE: Row[] = [
  row({ deadline: "01/09/2026", "Status Post": "DONE", "Content Pillar": "Article SEO", "Kode Konten": "K1", "Judul": "J1" }),
  row({ deadline: "10/09/2026", "Status Post": "done", "Content Pillar": "News", "Kode Konten": "K2", "Judul": "J2" }),
  row({ deadline: "15/09/2026", "Status Post": "Pending", "Content Pillar": "Article SEO", "Kode Konten": "K3", "Judul": "J3" }),
  row({ deadline: "20/09/2026", "Status Post": "selesai", "Content Pillar": "Galeri", "Kode Konten": "K4", "Judul": "J4" }),
  row({ deadline: "22/09/2026", "Status Post": "", "Content Pillar": "Linkedin", "Kode Konten": "K5", "Judul": "J5" }),
  row({ deadline: "05/10/2026", "Status Post": "true", "Content Pillar": "Album Galery", "Kode Konten": "K6", "Judul": "J6" }),
  row({ deadline: "08/10/2026", "Status Post": "not yet", "Content Pillar": "Berita", "Kode Konten": "K7", "Judul": "J7" }),
  row({ deadline: "not-a-date", "Status Post": "DONE", "Content Pillar": "News", "Kode Konten": "K8", "Judul": "J8" }),
];

describe("website derivations (V3 3_Website.py parity)", () => {
  it("derives distinct deadline-month labels in appearance order", () => {
    const m = websiteMonths(FIXTURE);
    expect(m).toEqual(["September 2026", "October 2026"]);
  });

  it("derives total / live / pending using DONE_KEYWORDS (upper/strip)", () => {
    const s = deriveWebsiteStats(FIXTURE);
    // DONE, done, selesai, true = live (4); not-a-date excluded from months -> filtered excludes K8
    expect(s.total).toBe(7);
    expect(s.live).toBe(4);
    expect(s.pending).toBe(3);
  });

  it("applies month filter when selected, default-all otherwise", () => {
    const all = deriveWebsiteStats(FIXTURE);
    expect(all.total).toBe(7);

    const sept = deriveWebsiteStats(FIXTURE, new Set(["September 2026"]));
    expect(sept.total).toBe(5); // 4 Sept rows + un-datable K8 (treats month absent as excluded)
    expect(sept.live).toBe(3);

    const empty = deriveWebsiteStats(FIXTURE, new Set([]));
    expect(empty.total).toBe(0);
  });

  it("skips filtering entirely when no month derivable (V3 column-absent branch)", () => {
    const noMonth = FIXTURE.map((r) => ({ ...r, [DEADLINE]: "n/a" }));
    const s = deriveWebsiteStats(noMonth);
    expect(s.months).toEqual([]);
    expect(s.total).toBe(noMonth.length); // all rows, unfiltered
  });

  it("computes per-pillar remaining counts matching V3 regex categories", () => {
    const s = deriveWebsiteStats(FIXTURE);
    const byKey = Object.fromEntries(s.pillars.map((p) => [p.key, p.count]));
    // pending rows: K3(Artikel), K5(Linkedin), K7(Berita)
    expect(byKey.artikel).toBe(1);
    expect(byKey.news).toBe(1);      // K7 Berita
    expect(byKey.galeri).toBe(0);
    expect(byKey.linkedin).toBe(1);
  });

  it("groups pending by Content Pillar, sorted", () => {
    const groups = pendingByPillar(FIXTURE);
    expect(groups.map((g) => g.pillar)).toEqual(["Article SEO", "Berita", "Linkedin"]);
    expect(groups[0].rows.length).toBe(1);
  });

  it("pillarStats returns stable V3 label/icon order", () => {
    expect(pillarStats(FIXTURE).map((p) => p.label)).toEqual(["Artikel", "News", "Galeri", "LinkedIn"]);
  });
});

describe("WebsiteDashboard (react-dom/server, no browser)", () => {
  const columns = ["Kode Konten", "Deadline", "Tanggal Posting", "Content Pillar", "SEO Rekomendasi", "Judul", "Status Check", "Bahan Upload", "LinkFolder Design", "Designer", "Status Writting", "Status Design", "Status Post", "Link Live"];

  it("renders key derived counts into the metric row", () => {
    const html = renderToStaticMarkup(
      <WebsiteDashboard rows={FIXTURE} columns={columns} />,
    );
    expect(html).toContain("Total Task");
    expect(html).toContain("Live Pages");
    expect(html).toContain("Pending");
    expect(html).toContain("Metrik Kunci");
    expect(html).toContain("Data Detail");
  });

  it("renders the empty → success message when every filtered row is done", () => {
    const doneRows = FIXTURE.filter((r) => String(r["Status Post"]).toUpperCase().trim() === "DONE")
      .slice(0, 2)
      .map((r) => ({ ...r, deadline: "01/09/2026" }));
    const html = renderToStaticMarkup(<WebsiteDashboard rows={doneRows} columns={columns} />, {});
    expect(html).toContain("Semua tugas clear!");
  });
});