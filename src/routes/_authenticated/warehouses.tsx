import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { EntityTree } from "@/components/EntityTree";

export const Route = createFileRoute("/_authenticated/warehouses")({ component: WarehousesPage });

function WarehousesPage() {
  return (
    <>
    <EntityTree table="warehouses" module="warehouses" title="شجرة المستودعات" usageCheck={{ table: "stock_moves", column: "warehouse_id", message: "لا يمكن حذف مستودع له حركات" }} />
    <CrudPage
      table="warehouses"
      module="warehouses"
      title="المستودعات"
      subtitle="تعريف المستودعات ومواقعها. المستودعات ذات الحركات لا تُحذف بل تُجمّد"
      orderBy="name"
      ascending
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
