import { publicCatalog, publicStatus, submitPublic } from "@/lib/operations/customers";
import { failure, jsonInput, response } from "@/lib/operations/http";
import { publicActions, slug, statusReference } from "@/lib/operations/validation";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const name = slug.parse((await context.params).slug);
    const ref = new URL(request.url).searchParams.get("ref");
    return response(ref === null ? await publicCatalog(name) : await publicStatus(name, statusReference.parse(ref)));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const name = slug.parse((await context.params).slug);
    return response(await submitPublic(name, publicActions.parse(await jsonInput(request))), 201);
  } catch (error) { return failure(error); }
}
