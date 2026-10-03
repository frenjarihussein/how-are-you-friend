import { useQuery } from "@tanstack/react-query";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";

export const DEFAULT_UNITS = ["قطعة", "كغ", "غرام", "طن", "لتر", "متر", "متر مربع", "متر مكعب", "علبة", "كيس", "رزمة", "دزينة", "ساعة"];

export type CustomUnit = { id: string; name: string; base_unit: string | null; factor: number };

export function useUnits() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["units", me?.tenantId],
    enabled: !!me?.tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => ((await scope((db.from("units" as any) as any).select("id,name,base_unit,factor"), me?.tenantId).order("name")).data ?? []) as CustomUnit[],
  });
}

export function unitOptions(custom: CustomUnit[] = []) {
  const opts = DEFAULT_UNITS.map((u) => ({ value: u, label: u }));
  custom.forEach((c) => {
    if (!DEFAULT_UNITS.includes(c.name))
      opts.push({ value: c.name, label: c.base_unit ? `${c.name} (${c.factor} ${c.base_unit})` : c.name });
  });
  return opts;
}
