import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REGION_ID = "barcode-scan-region";

/**
 * Camera barcode scanner — works on laptop webcams and mobile browsers
 * (Chrome, Safari, Firefox) via html5-qrcode. Handheld USB/Bluetooth
 * scanners work by typing into any search field directly.
 */
export function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const busy = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode(REGION_ID, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (w: number, h: number) => ({ width: Math.floor(w * 0.9), height: Math.floor(h * 0.6) }),
            videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          } as never,
          (text: string) => {
            if (busy.current) return;
            busy.current = true;
            onScanRef.current(text.trim());
            setOpen(false);
          },
          () => {},
        );
      } catch {
        if (!cancelled) setErr("تعذّر فتح الكاميرا — تأكد من السماح بالوصول إليها من إعدادات المتصفح، أو استخدم جهاز قارئ يدوي.");
      }
    })();

    return () => {
      cancelled = true;
      busy.current = false;
      if (scanner) {
        scanner.stop().catch(() => {}).then(() => scanner.clear().catch(() => {}));
      }
    };
  }, [open]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setErr(""); setOpen(true); }}>
        <Camera className="size-4" />مسح بالكاميرا
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>وجّه الكاميرا نحو الباركود</DialogTitle></DialogHeader>
          <div id={REGION_ID} className="w-full overflow-hidden rounded-md bg-muted [&_video]:w-full [&_video]:rounded-md" />
          {err && <p className="text-sm text-destructive">{err}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
