import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { EntityTree } from "@/components/EntityTree";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/warehouses")({ component: WarehousesPage });

function WarehousesPage() {
  return (
    <>
    <EntityTree table="warehouses" module="warehouses" title="شجرة المستودعات" usageCheck={{ table: "stock_moves", column: "warehouse_id", message: "لا يمكن حذف مستودع له حركات" }} />
    <CrudPage
      table="warehouses"
      module="warehouses"
      title="المستودعات"
      subtitle="تعريف المستودعات ومواقعها. اضغط أيقونة الكشف لعرض كشف حساب المستودع"
      orderBy="name"
      ascending
      extraRowAction={(row) => (
        <Button asChild size="icon" variant="ghost" title="كشف حساب المستودع">
          <Link to="/ledgers" search={{ tab: "warehouse", id: row.id }}>
            <FileText className="size-4" />
          </Link>
        </Button>
      )}
      fields={[
        { key: "code", label: "الرمز" },
        { key: "parent_id", label: "الأب", type: "ref", refTable: "warehouses" },
        { key: "name", label: "اسم المستودع", required: true },
        { key: "location", label: "الموقع" },
        { key: "is_active", label: "نشط", type: "checkbox", defaultValue: true },
      ]}
    />
    </>
  );
}
