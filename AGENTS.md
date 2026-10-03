<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Cashier account types live in profiles.account_kind; AppShell routes non-standard kinds to their own tab set (CASHIER_TABS) — keeps cashiers out of the full menu.
- Per-user UI choices (notification kinds, dashboard tiles) are stored in public.user_prefs as jsonb — one row per user, no schema change per new option.
- Product categories use group rows in public.products and product parent_id points to the selected category — keeps the existing product tree as the category hierarchy.
