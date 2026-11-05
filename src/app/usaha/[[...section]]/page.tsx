import { redirect } from "next/navigation";
import { actor } from "@/lib/operations/auth";
import { OperationsShell } from "@/components/operations/shell";
import { Login } from "@/components/operations/shared";

export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const user = await actor();
  if (!user) return <Login/>;
  const { section } = await params;
  if (user.role === "cashier" && !section?.length) redirect("/usaha/kasir");
  return <OperationsShell role={user.role} name={user.name} demo={!!user.demo} section={(section ?? []).join("/")}/>;
}
