import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";

export type Currency = { code: string; name: string; symbol: string | null };

const BASE: Currency[] = [
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "SYP", name: "ليرة سورية", symbol: "ل.س" },
];

/** Built-in currencies plus the ones the company added in settings. */
export function useCurrencies() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["currencies", me?.tenantId],
    enabled: !!me,
    queryFn: async (): Promise<Currency[]> => {
      const { data } = await db.from("currencies").select("code,name,symbol").order("code");
      const out = [...BASE];
      (data ?? []).forEach((c: Currency) => {
        if (!out.some((x) => x.code === c.code)) out.push(c);
      });
      return out;
    },
  });
}

export function CurrencyOptions() {
  const { data } = useCurrencies();
  return (
    <>
      {(data ?? BASE).map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} {c.symbol ? `(${c.symbol})` : `(${c.code})`}
        </option>
      ))}
    </>
  );
}
