import { useRef, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { cn } from "@/lib/utils";

/**
 * Barcode entry box: handheld scanners type the code and press Enter;
 * the camera button scans on phones/tablets. Calls onCode with the trimmed code.
 */
export function BarcodeInput({
  onCode,
  autoFocus,
  className,
  big,
}: {
  onCode: (code: string) => void;
  autoFocus?: boolean;
  className?: string;
  big?: boolean;
}) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          autoFocus={autoFocus}
          dir="ltr"
          value={v}
          placeholder="امسح أو اكتب الباركود ثم Enter"
          className={cn("ps-10", big && "h-14 text-lg")}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const c = v.trim();
            if (c) onCode(c);
            setV("");
          }}
        />
      </div>
      <BarcodeScanner onScan={(c) => { onCode(c.trim()); ref.current?.focus(); }} />
    </div>
  );
}

/** Finds a product by barcode or SKU (case-insensitive SKU). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findByCode<T extends { barcode?: string | null; sku?: string | null }>(list: T[], code: string) {
  const c = code.toLowerCase();
  return list.find((p) => p.barcode === code) ?? list.find((p) => (p.sku ?? "").toLowerCase() === c);
}
