import { NextRequest } from "next/server";
import { overviewMetricsController } from "@/server/api/overviewControllers";
import { getMasterSource, getRegistrationSource } from "@/server/api/context";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return overviewMetricsController(getSession(request), getMasterSource(), getRegistrationSource);
}