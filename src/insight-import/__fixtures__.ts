/**
 * Shared JSON/CSV fixtures embedded as literals so tests never depend on
 * C:/Users/muham/Downloads paths at test time. Mirrors the verified shapes:
 *  - TikTok Overview (UTF-8): Date,Video Views,Profile Views,Likes,Comments,Shares
 *  - TikTok FollowerHistory (UTF-8): Date,Followers,Difference in followers...
 *  - Instagram per-metric (UTF-16LE + BOM + sep=, + title + Date,Primary)
 */
export const TIKTOK_OVERVIEW_CSV = [
  '"Date","Video Views","Profile Views","Likes","Comments","Shares"',
  '"August 31","1441","52","31","2","11"',
  '"September 1","2110","77","57","1","6"',
  '"September 17","9902","72","73","0","3"',
].join("\n");

export const TIKTOK_OVERVIEW_LINES = 4; // header + 3 rows (short fixture)

export const TIKTOK_FOLLOWER_CSV = [
  '"Date","Followers","Difference in followers from previous day"',
  '"August 31","10405","35"',
  '"September 1","10440","46"',
  '"September 17","10888","0"',
].join("\n");

/** Full 18-row TikTok Overview (Aug 31..Sep 17) content-interaction ground truth. */
export const TIKTOK_OVERVIEW_FULL_ROWS: Array<[string, number, number, number, number, number]> = [
  ["August 31", 1441, 52, 31, 2, 11],
  ["September 1", 2110, 77, 57, 1, 6],
  ["September 2", 8806, 137, 103, 1, 5],
  ["September 3", 7914, 70, 80, 1, 7],
  ["September 4", 13639, 97, 124, 2, 1],
  ["September 5", 10808, 62, 114, 0, 5],
  ["September 6", 10706, 80, 73, 0, 2],
  ["September 7", 10109, 84, 59, 2, 1],
  ["September 8", 11976, 103, 74, 0, 9],
  ["September 9", 20466, 149, 170, 1, 3],
  ["September 10", 13231, 87, 75, 0, 5],
  ["September 11", 13671, 100, 120, 2, 7],
  ["September 12", 18077, 139, 122, 0, 27],
  ["September 13", 12561, 109, 85, 3, 18],
  ["September 14", 14160, 85, 70, 1, 7],
  ["September 15", 8988, 96, 87, 0, 10],
  ["September 16", 9944, 86, 84, 1, 2],
  ["September 17", 9902, 72, 73, 0, 3],
];

export const TIKTOK_FOLLOWER_FULL_ROWS: Array<[string, number, number]> = [
  ["August 31", 10405, 35],
  ["September 1", 10440, 46],
  ["September 2", 10486, 40],
  ["September 3", 10526, 49],
  ["September 4", 10575, 40],
  ["September 5", 10615, 35],
  ["September 6", 10650, 22],
  ["September 7", 10672, 27],
  ["September 8", 10699, 29],
  ["September 9", 10728, 16],
  ["September 10", 10744, 30],
  ["September 11", 10774, 19],
  ["September 12", 10786, -6],
  ["September 13", 10806, 18],
  ["September 14", 10831, 18],
  ["September 15", 10849, 21],
  ["September 16", 10870, 18],
  ["September 17", 10888, 0],
];

/** Build a UTF-16LE-with-BOM Instagram per-metric CSV string (matches real). */
export function makeInstagramCsv(title: string, rows: Array<[string, number]>): string {
  const lines = [
    "sep=,",
    `"${title}"`,
    `"Date","Primary"`,
    ...rows.map(([d, v]) => `"${d}","${v}"`),
  ];
  const text = lines.join("\n");
  // UTF-16LE BOM bytes are FF FE (U+FEFF encoded little-endian), then each
  // character as 2-byte LE — matches the real Excel exports.
  const buf = Buffer.alloc(2 + text.length * 2);
  buf[0] = 0xff;
  buf[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    buf.writeUInt16LE(text.charCodeAt(i), 2 + i * 2);
  }
  return buf.toString("binary"); // bytes preserved for Buffer.from(...)
}

/** ISO date strings for the 28-day IG window (2026-08-22..2026-09-18). */
export const IG_DATES_28: string[] = (() => {
  const out: string[] = [];
  const start = new Date(Date.UTC(2026, 7, 22)); // Aug 22
  for (let i = 0; i < 28; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    out.push(`${d.toISOString().slice(0, 10)}T00:00:00`);
  }
  return out;
})();

/** Per-metric IG values keyed by (title -> array aligned to IG_DATES_28). */
export const IG_FILES_6: Record<string, number[]> = {
  Views: [
    8226, 905, 27, 10072, 9119, 829, 848, 1099, 148, 90, 882, 6208, 4014, 5437, 6666, 7681, 4323,
    4312, 6456, 9537, 14296, 6123, 5831, 5221, 19905, 29131, 36225, 32370,
  ],
  Viewers: [
    7485, 826, 24, 9215, 8410, 798, 820, 1054, 144, 87, 852, 6008, 3894, 5249, 6449, 7433, 4186,
    4186, 6253, 9241, 13853, 5932, 5648, 5058, 19283, 28200, 35082, 31347,
  ],
  "Content interactions": [
    10, 4, 2, 8, 5, 3, 6, 9, 2, 1, 4, 7, 3, 5, 8, 2, 6, 1, 9, 4, 7, 3, 2, 5, 8, 6, 4, 3,
  ],
  "Facebook visits": [
    24, 10, 0, 39, 24, 11, 9, 33, 12, 4, 18, 22, 16, 10, 29, 14, 15, 5, 21, 35, 47, 19, 13, 28, 44, 51, 36, 30,
  ],
  "Facebook link clicks": [
    16, 1, 0, 24, 11, 0, 2, 19, 1, 0, 6, 8, 5, 2, 17, 4, 0, 1, 9, 13, 22, 7, 3, 12, 20, 25, 15, 10,
  ],
  "Facebook follows": [
    3, 0, 0, 2, 1, 0, 0, 1, 0, 0, 1, 0, 2, 1, 0, 0, 1, 0, 0, 1, 2, 0, 0, 1, 0, 1, 0, 1,
  ],
};

/** Raw IG CSV bytes for one metric (UTF-16LE; use Buffer.from(x, "binary")). */
export function instagramBytes(title: string, rows: Array<[string, number]>): Buffer {
  return Buffer.from(makeInstagramCsv(title, rows), "binary");
}

export const IG_28_ROWS: Array<[string, number]> = IG_DATES_28.map((d, i) => [
  d,
  IG_FILES_6["Views"][i],
]);