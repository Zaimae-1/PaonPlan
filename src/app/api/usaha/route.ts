import { actor, requireActor, signIn, signOut } from "@/lib/operations/auth";
import { perform } from "@/lib/operations/actions";
import { failure, jsonInput, response } from "@/lib/operations/http";
import { closingNote } from "@/lib/operations/reporting";
import { adminActions, credentials, date, staffActions } from "@/lib/operations/validation";
import { readView } from "@/lib/operations/views";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "session") {
      const current = await actor();
      return response(current ? { name: current.name, role: current.role } : null);
    }
    return response(await readView(await requireActor(), params));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await jsonInput(request);
    const { action } = z.object({ action: z.string() }).parse(body);
    if (action === "login") {
      const { email, password } = credentials.parse(body);
      return response(await signIn(email, password));
    }
    if (action === "logout") {
      await signOut();
      return response({ ok: true });
    }
    if (action === "note") {
      const current = await requireActor(true);
      const selected = z.object({ date }).parse(body);
      return response(await closingNote(current.shop_id, selected.date));
    }
    const staff = ["checkout","orderStatus","fulfil"].includes(action);
    const current = await requireActor(!staff);
    const operationKey = z.object({ operationKey: z.uuid().optional() }).parse(body).operationKey;
    return response(await perform(current, staff ? staffActions.parse(body) : adminActions.parse(body), operationKey));
  } catch (error) { return failure(error); }
}
