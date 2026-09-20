import { NextRequest } from "next/server";
import { logoutController } from "@/server/api/authControllers";
import { getSession } from "@/lib/auth";
import { getDefaultAuditLog } from "@/server/api/context";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  return logoutController(request, session, getDefaultAuditLog());
}