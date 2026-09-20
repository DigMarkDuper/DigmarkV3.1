import { NextRequest } from "next/server";
import { syncController } from "@/server/api/syncControllers";
import { getMasterSource, getDefaultAuditLog } from "@/server/api/context";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  return syncController(getSession(request), getMasterSource(), getDefaultAuditLog());
}