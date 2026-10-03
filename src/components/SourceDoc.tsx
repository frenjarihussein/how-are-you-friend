import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { AttachmentsButton } from "@/components/AttachmentsButton";

export const SOURCE_LABEL: Record<string, string> = {
  manual: "قيد يدوي", sale: "فاتورة مبيع", purchase: "فاتورة شراء", receipt: "سند قبض", payment: "سند دفع",
  stock_in: "إدخال مستودع", stock_out: "إخراج إلى مشروع", transfer: "مناقلة مستودعات", opening: "قيد افتتاحي", closing: "قيد إقفال",
};

/** Shows the origin document of a journal entry (type, number, and its attachments). */
export function SourceDoc({ docType, documentId, full }: { docType: string; documentId: string | null; full?: boolean }) {
  const doc = useQuery({
    queryKey: ["source_doc", documentId],
    enabled: !!documentId,
    queryFn: async () => (await db.from("documents").select("id,doc_no,doc_type,doc_date,amount,currency,notes").eq("id", documentId!).maybeSingle()).data,
  });
  const label = SOURCE_LABEL[doc.data?.doc_type ?? docType] ?? docType;
  if (!documentId) return <span className="text-xs text-muted-foreground">{label}</span>;
  if (!full)
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        {label}{doc.data?.doc_no ? <span className="num">#{doc.data.doc_no}</span> : null}
        <AttachmentsButton entityType="document" entityId={documentId} docType={doc.data?.doc_type} />
      </span>
    );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded border bg-muted/40 p-3 text-sm">
      <b>أصل السند:</b>
      <span>{label} {doc.data?.doc_no ? <span className="num">رقم {doc.data.doc_no}</span> : null}</span>
      {doc.data && <span>{fmtDate(doc.data.doc_date)}</span>}
      {doc.data && <span className="num">{fmtMoney(doc.data.amount, doc.data.currency)}</span>}
      {doc.data?.notes && <span className="text-muted-foreground">{doc.data.notes}</span>}
      <span className="no-print"><AttachmentsButton entityType="document" entityId={documentId} docType={doc.data?.doc_type} variant="outline" label="مرفقات المستند الأصلي" /></span>
    </div>
  );
}
