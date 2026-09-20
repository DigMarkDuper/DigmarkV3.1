import { NextRequest } from "next/server";
import { appendTableController, getTableController, updateCellController } from "@/server/api/tableControllers";
import { getMasterSource, getDefaultAuditLog } from "@/server/api/context";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { key } = await params;
  return getTableController(getSession(request), getMasterSource(), key);
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { key } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return appendTableController(getSession(request), getMasterSource(), key, body, getDefaultAuditLog());
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { key } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return updateCellController(getSession(request), getMasterSource(), key, body as { rowIndex?: unknown; column?: unknown; value?: unknown }, getDefaultAuditLog());
}