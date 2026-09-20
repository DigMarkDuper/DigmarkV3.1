import { NextRequest } from "next/server";
import { clearController } from "@/server/api/clearControllers";
import { getMasterSource, getDefaultAuditLog } from "@/server/api/context";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { key } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return clearController(
    getSession(request),
    getMasterSource(),
    key,
    body as { confirm?: unknown; tabTitle?: unknown },
    getDefaultAuditLog(),
  );
}