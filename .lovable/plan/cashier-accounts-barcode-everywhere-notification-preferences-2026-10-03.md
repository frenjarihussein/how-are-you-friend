# Cashier accounts, barcode everywhere, notification preferences, simpler screens

Already fixed now: the side menu shows Payroll, Recurring entries and Stocktake for the company admin (sign in as the company admin, not the system owner, who only sees company management). Payroll is now a permission that can be granted to users.

## 1. Cashier account types (touch-screen point of sale)
When creating a user, the admin picks an account type:
- **Sales cashier** — sees only a sales screen
- **Purchase cashier** (purchasing committee) — sees only a purchase screen
- **Warehouse keeper** — sees only warehouse operations (stock in/out, transfers, stocktake)

These users skip the normal menu and land on a full-screen, touch-friendly page:
- Big tiles of products (with search and category filter), large buttons, big totals
- A barcode box always focused: a handheld scanner or camera scan adds the item instantly
- Cart with +/- quantity, customer/supplier pick (default "cash customer"), pay and save
- Saving creates a normal sales/purchase invoice, so stock and accounts update as today
- Print receipt option
- Warehouse keeper screen: choose operation (receive, issue, transfer, stocktake), scan items, confirm

## 2. Barcode in all product flows
- Add/edit product: barcode field with "scan" (camera) and "generate" buttons (already partly there)
- Sales and purchase invoices and stock movements: scan or type a barcode to add the line

## 3. Notification preferences per account
In account settings, each user chooses what reaches them, with sensible defaults by role:
- Low stock, cheques due, new invoices, posted/unposted documents, entries audited, payroll posted, system announcements
- Admin defaults: all; auditor defaults: new/posted entries and documents; cashiers: low stock + announcements
- The bell only shows notifications the user subscribed to. Company events generate notifications automatically.

## 4. Simpler screens
- Dashboard becomes a grid of shortcut tiles; the user picks which tiles and figures appear (saved per user)
- List pages open showing a short summary + latest few records; full table, filters and columns open on demand

## Technical details
- New column `profiles.account_kind` (`standard | sales_cashier | purchase_cashier | warehouse_keeper`), set via createUserAccount; matching default permissions.
- AppShell: cashier kinds redirect to `/pos` (sales/purchase) or `/warehouse-desk`; standard menu hidden for them.
- Notifications: add `kind` + optional `target` columns; table `notification_prefs(user_id, kind, enabled)` with RLS; tenant admins/triggers can insert tenant notifications; triggers on documents/journal_entries/cheques/products emit events.
- `user_dashboard_prefs(user_id, widgets jsonb)` for chosen tiles.
- Shared `BarcodeInput` component (keyboard-wedge + camera) reused across product form, documents, stock, POS.
