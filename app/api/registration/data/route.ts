import { getRegistrationController, updateRegistrationCellController } from "@/server/api/registrationControllers";
import { getRegistrationSource, getDefaultAuditLog } from "@/server/api/context";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  return getRegistrationController(getSession(request), () => getRegistrationSource());
}

export async function PATCH(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return updateRegistrationCellController(
    getSession(request),
    () => getRegistrationSource(),
    body as { rowIndex?: unknown; column?: unknown; value?: unknown },
    getDefaultAuditLog(),
  );
}