import { NextRequest } from "next/server";
import { adsMetricsController } from "@/server/api/adsControllers";
import { getMasterSource } from "@/server/api/context";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return adsMetricsController(getSession(request), getMasterSource());
}