import { toast } from "sonner";
import { useMe } from "@/lib/session";
import { NOTIF_KINDS, usePrefs, useSavePrefs } from "@/lib/prefs";
import { Switch } from "@/components/ui/switch";

/** Lets the signed-in user choose which notification types reach them. */
export function NotificationPrefs() {
  const { data: me } = useMe();
  const prefs = usePrefs(me);
  const save = useSavePrefs(me);
  const notif = prefs.data?.notif ?? {};
  return (
    <div className="space-y-2">
      {NOTIF_KINDS.map((k) => (
        <label key={k.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span>{k.label}</span>
          <Switch
            checked={!!notif[k.key]}
            onCheckedChange={(v) =>
              save.mutate({ notif: { ...notif, [k.key]: v } }, { onError: (e) => toast.error((e as Error).message) })
            }
          />
        </label>
      ))}
    </div>
  );
}
