import { getRegistrationController } from "@/server/api/registrationControllers";
import { getRegistrationSource } from "@/server/api/context";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  return getRegistrationController(getSession(request), () => getRegistrationSource());
}