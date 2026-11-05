import { Storefront } from "@/components/operations/storefront";
import { slug as validSlug } from "@/lib/operations/validation";
import { notFound } from "next/navigation";

export default async function Page({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  if (!validSlug.safeParse(slug).success) notFound();
  const { ref } = await searchParams;
  return <Storefront slug={slug} reference={ref}/>;
}
