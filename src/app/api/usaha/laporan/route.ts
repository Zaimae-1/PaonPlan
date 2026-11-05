import { requireActor } from "@/lib/operations/auth";
import { failure } from "@/lib/operations/http";
import { salesPdf } from "@/lib/operations/pdf";
import { reportData } from "@/lib/operations/reporting";
import { period } from "@/lib/operations/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireActor(true);
    const params = new URL(request.url).searchParams;
    const { start, end } = period.parse({ start: params.get("start"), end: params.get("end") });
    const data = await reportData(user.shop_id, start, end);
    const pdf = await salesPdf(data, start, end);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="paonplan-${start}-${end}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) { return failure(error); }
}
