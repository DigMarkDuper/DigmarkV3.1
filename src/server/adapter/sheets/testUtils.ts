/**
 * In-memory fake of the Sheets API surface, for network-free unit tests.
 * Backs `SheetsApiClient` with a real data store so source read/write/clear and
 * cache-invalidation behavior can be tested without hitting Google.
 */

import type { BatchRequest, SheetsApiClient } from "./client";

export interface MemoryTab {
  title: string;
  gid: number;
  values: unknown[][];
}

function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/** Write `src` into a FakeApi tab starting at (col,row) (row 1-based). */
function setRange(t: MemoryTab, startCol: string, startRow: number, src: unknown[][]): void {
  const startColIdx = colToIndex(startCol);
  for (let r = 0; r < src.length; r++) {
    while (t.values.length < startRow + r) {
      t.values.push([]);
    }
    const row = t.values[startRow - 1 + r];
    for (let c = 0; c < src[r].length; c++) {
      row[startColIdx - 1 + c] = src[r][c];
    }
  }
}

function parseTitle(range: string): string {
  const m = range.replace(/^'/, "").match(/^([^!]*)!/);
  return m ? m[1].replace(/'/g, "") : "";
}

export class FakeApi implements SheetsApiClient {
  tabs: MemoryTab[] = [];

  constructor(defs: { title: string; gid: number; values?: unknown[][] }[]) {
    this.tabs = defs.map((d) => ({ title: d.title, gid: d.gid, values: d.values ? d.values.map((r) => [...r]) : [] }));
  }

  find(title: string): MemoryTab {
    const t = this.tabs.find((x) => x.title === title);
    if (!t) {
      throw new Error(`FakeApi: tab '${title}' does not exist`);
    }
    return t;
  }

  setValues(title: string, values: unknown[][]): void {
    this.find(title).values = values.map((r) => [...r]);
  }

  readonly spreadsheets = {
    get: async () => ({
      data: {
        spreadsheetId: "fake",
        sheets: this.tabs.map((t) => ({ properties: { title: t.title, sheetId: t.gid } })),
      },
    }),

    values: {
      get: async (params: unknown) => {
        const p = params as { range: string };
        const title = parseTitle(p.range);
        try {
          return { data: { values: this.find(title).values } };
        } catch {
          return { data: { values: undefined } };
        }
      },

      append: async (params: unknown) => {
        const p = params as { range: string; requestBody: { values: unknown[][] } };
        const title = parseTitle(p.range);
        const t = this.find(title);
        for (const row of p.requestBody.values) {
          t.values.push([...row]);
        }
        return { data: { updates: { updatedRange: p.range, updatedRows: p.requestBody.values.length } } };
      },

      update: async (params: unknown) => {
        const p = params as { range: string; requestBody: { values: unknown[][] } };
        const title = parseTitle(p.range);
        const t = this.find(title);
        const cur = p.range.split("!")[1] ?? "A1";
        const m = cur.match(/^([A-Z]+)(\d+)(?::.*)?$/);
        if (!m) {
          throw new Error("FakeApi: cannot parse update range " + p.range);
        }
        setRange(t, m[1], Number(m[2]), p.requestBody.values);
        return { data: { updatedRange: p.range } };
      },

      batchUpdate: async (params: unknown) => {
        const p = params as {
          requestBody: { data: { range: string; values: unknown[][] }[] };
        };
        for (const item of p.requestBody.data) {
          const title = parseTitle(item.range);
          const t = this.find(title);
          const cur = item.range.split("!")[1] ?? "A1";
          const m = cur.match(/^([A-Z]+)(\d+)/);
          setRange(t, m ? m[1] : "A", m ? Number(m[2]) : 1, item.values);
        }
        return {};
      },

      clear: async (params: unknown) => {
        const p = params as { range: string };
        const t = this.find(parseTitle(p.range));
        t.values = [];
        return {};
      },

      batchGet: async () => ({ data: { valueRanges: [] } }),
    },

    batchUpdate: async (params: unknown) => {
      const p = params as { resource: { requests: BatchRequest[] } };
      for (const req of p.resource.requests) {
        if (req.addSheet) {
          const title = req.addSheet.properties.title;
          const gid = this.tabs.length + 100;
          this.tabs.push({ title, gid, values: [] });
        } else if (req.deleteSheet) {
          const id = req.deleteSheet.sheetId;
          const i = this.tabs.findIndex((t) => t.gid === id);
          if (i >= 0) {
            this.tabs.splice(i, 1);
          }
        } else if (req.updateSheetProperties) {
          const id = req.updateSheetProperties.properties.sheetId;
          const t = this.tabs.find((x) => x.gid === id);
          if (t) {
            if (req.updateSheetProperties.properties.title !== undefined) {
              t.title = req.updateSheetProperties.properties.title;
            }
            if (req.updateSheetProperties.properties.index !== undefined) {
              this.tabs.splice(req.updateSheetProperties.properties.index, 0, this.tabs.splice(this.tabs.indexOf(t), 1)[0]);
            }
          }
        }
      }
      return {};
    },
  };
}

export function titleOf(tabs: MemoryTab[], gid: number): string | undefined {
  return tabs.find((t) => t.gid === gid)?.title;
}