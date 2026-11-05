import Image from "next/image";
import { Coffee, Drumstick, GlassWater, Leaf, Salad, Soup, UtensilsCrossed } from "lucide-react";

// Register future local PNGs by menu name, for example "ayam betutu": "/menu/ayam-betutu.png".
const menuImages: Record<string, string> = {};

function foodKind(name: string, category: string) {
  const text = (name + " " + category).toLocaleLowerCase("id-ID");
  if (/kopi|coffee/.test(text)) return "coffee";
  if (/minuman|loloh|jeruk|teh|jus|es /.test(text)) return "drink";
  if (/sate/.test(text)) return "satay";
  if (/cantok|tipat/.test(text)) return "ketupat";
  if (/lawar|sayur/.test(text)) return "salad";
  if (/ares|kuah|sup/.test(text)) return "soup";
  if (/betutu|ayam|bebek/.test(text)) return "chicken";
  if (/nasi|jinggo/.test(text)) return "rice";
  return "dish";
}

export function CategoryIcon({ name, size = 18 }: { name: string; size?: number }) {
  if (/minuman|kopi|teh/i.test(name)) return <GlassWater size={size}/>;
  if (/sayur|kuah/i.test(name)) return <Salad size={size}/>;
  if (/lauk|ayam|ikan/i.test(name)) return <Drumstick size={size}/>;
  return <UtensilsCrossed size={size}/>;
}

export function MenuArt({ name, category = "", compact = false }: { name: string; category?: string; compact?: boolean }) {
  const source = menuImages[name.toLocaleLowerCase("id-ID")];
  const kind = foodKind(name, category);
  const icons = { coffee: Coffee, drink: GlassWater, chicken: Drumstick, salad: Salad, soup: Soup, rice: Soup, dish: UtensilsCrossed };
  const Icon = kind in icons ? icons[kind as keyof typeof icons] : null;
  return <span className={`food-art food-art--${kind}${compact ? " food-art--compact" : ""}`} aria-hidden="true">
    {source ? <Image src={source} alt="" fill sizes={compact ? "52px" : "(max-width: 640px) 45vw, 320px"}/>
      : <>
        <span className="food-art-orbit"/>
        {Icon ? <Icon className="food-art-icon" strokeWidth={1.45}/> : kind === "satay" ?
          <svg className="food-art-icon" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <path d="m18 81 33-60m-8 62 32-60m-9 60 19-36"/>
            <path d="m33 49 10 5m-4-16 10 5m-4-16 10 5m-1 28 10 5m-5-16 10 5m-4-16 10 5m-1 23 9 4m-3-15 9 4"/>
          </svg> :
          <svg className="food-art-icon" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
            <path d="m48 15 29 33-29 33L19 48Z" fill="currentColor" fillOpacity=".1"/>
            <path d="m34 31 29 33M25 43l28 32m10-44L34 64m37-21L43 75M41 23l29 32M55 23 26 55M43 10l-4-7m15 84 7 7"/>
          </svg>}
        {!compact && <><Leaf className="food-art-leaf" strokeWidth={1.4}/><span className="food-art-spark">✦</span></>}
      </>}
  </span>;
}
