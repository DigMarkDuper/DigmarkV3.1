import { NextRequest } from "next/server";
import { tabsMetaController } from "@/server/api/metaControllers";
import { getMasterSource } from "@/server/api/context";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return tabsMetaController(getSession(request), getMasterSource());
}