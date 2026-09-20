import { NextRequest } from "next/server";
import { importController } from "@/server/api/importControllers";
import { getMasterSource, getDefaultAuditLog } from "@/server/api/context";
import { getSession } from "@/lib/auth";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { key } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "A 'file' field (multipart) is required.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return await importController(
      getSession(request),
      getMasterSource(),
      key,
      file.name,
      buffer,
      getDefaultAuditLog(),
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}