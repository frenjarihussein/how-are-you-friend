import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

export function useBranding() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["branding", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data } = await db
        .from("tenant_settings")
        .select("logo_url, primary_color")
        .eq("tenant_id", me!.tenantId!)
        .maybeSingle();
      return (data ?? { logo_url: null, primary_color: null }) as { logo_url: string | null; primary_color: string | null };
    },
  });
}

const VARS = ["--primary", "--ring", "--sidebar-primary", "--accent"];

/** Applies the company colour to the whole app (buttons, links, menu highlight). */
export function useApplyBrandColor(color: string | null | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (!color) {
      VARS.forEach((v) => root.style.removeProperty(v));
      root.style.removeProperty("--primary-foreground");
      root.style.removeProperty("--sidebar-primary-foreground");
      return;
    }
    VARS.forEach((v) => root.style.setProperty(v, color));
    const fg = isLight(color) ? "#111111" : "#ffffff";
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--sidebar-primary-foreground", fg);
  }, [color]);
}

function isLight(hex: string) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

const toHex = (n: number) => n.toString(16).padStart(2, "0");

/** Reads an image file, shrinks it, and returns a data URL plus suggested colours taken from it. */
export async function processLogo(file: File): Promise<{ dataUrl: string; colors: string[] }> {
  const src = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const scale = Math.min(1, 256 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/png");
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40 || max < 40 || min > 225) continue; // skip greys, black, white
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((e) => `#${toHex(Math.round(e.r / e.n))}${toHex(Math.round(e.g / e.n))}${toHex(Math.round(e.b / e.n))}`);
  return { dataUrl, colors };
}
