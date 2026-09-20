import { NextRequest } from "next/server";
import { loginController } from "@/server/api/authControllers";
import { getDefaultAuditLog } from "@/server/api/context";

export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null; // loginController returns VALIDATION_FAILED(400)
  }
  return loginController(request, body, getDefaultAuditLog());
}