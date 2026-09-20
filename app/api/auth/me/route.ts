import { NextRequest } from "next/server";
import { meController } from "@/server/api/authControllers";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return meController(getSession(request));
}