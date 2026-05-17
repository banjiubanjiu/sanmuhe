# Sanmuhe Admin Visual Benchmark

This file turns `docs/后台设计.png` and `docs/后台1.png` through `docs/后台10.png`
into hard frontend constraints for the admin app.

## Aesthetic Direction

东方纸本经营中枢: a quiet operational console that feels like ink, rice paper,
tea room objects, and precise retail administration. The interface must not look
like a generic SaaS template.

## Source Evidence

- Canvas: all supplied backend references are 1536 x 1024.
- Sidebar: fixed pale paper rail, about 216px wide, with logo at top and an ink
  landscape object composition anchored to the lower-left.
- Workspace: warm off-white paper, subtle top-right ink wash, generous outer
  margins, dense but calm B-side information layout.
- Active navigation: dark moss rectangle, small icon, white text, about 48px
  tall with 10px radius.
- Panels: 1px warm gray border, 14-18px radius, off-white translucent surface,
  extremely soft shadow, no heavy card chrome.
- Typography: Chinese serif is the primary voice. Large numbers use a restrained
  serif figure style. Labels are smaller, muted, and never loud.
- Data modules: KPI row, filter strip, table/list body, and right-side detail or
  edit panel. Operations pages favor table + drawer composition.
- Signature element: grayscale/ink side scene using tea object plus distant
  mountains. It must be visible on admin pages, not just login.

## Professional Operating Rules

External admin UX research checked with Exa on 2026-05-17 points to the same
bar: a production admin is judged by daily operational confidence, not by page
count. Apply these rules before adding more modules.

- Every module must surface the current result scope, active filters, last
  successful sync, write permission boundary, and risky-operation rule.
- Tables and list views must handle loading, error, zero-result, pagination, and
  long text states. Status must always include readable text, never color alone.
- High-impact actions involving money, inventory, permissions, user privacy,
  production settings, content visibility, backups, or exports require a clear
  reason and an audit trail.
- Export labels should tell whether the export uses current filters. Large
  backup/export flows should say where the file goes and whether links are
  temporary.
- Empty states must explain what belongs in the module and provide the next
  useful action. Blank panels or generic "No data" states are not acceptable.
- Role-aware UI must be permission-based, not role-name based. A disabled or
  hidden action should be an intentional product choice, not an incidental
  template behavior.

## Tokens

- `--admin-bg`: #f7f3eb
- `--admin-paper`: #fffdf7
- `--admin-surface`: rgba(255, 253, 247, 0.82)
- `--admin-sidebar`: #f4f0e7
- `--admin-ink`: #1f241b
- `--admin-muted`: #7d796e
- `--admin-line`: rgba(72, 68, 56, 0.13)
- `--admin-green`: #4d6542
- `--admin-green-dark`: #3d5234
- `--admin-gold`: #b8945a
- `--admin-warn`: #c28a33
- `--admin-danger`: #b65a46

## Layout Rules

- Admin shell uses `216px 1fr` columns on desktop.
- Workspace max width is 1288px, aligned with the 1536px reference canvas.
- Page header is quiet: title left, notification/admin right. Filters live in
  module panels, not as a global command-heavy top bar.
- KPI cards should be 112-132px tall with circular icon wells.
- Main operational pages use `minmax(0, 1fr) 360-384px` split panels.
- Tables should have pale header bands, 60-68px rows, subtle selected row wash,
  and status dots/pills.

## Rejected Defaults

- No blue/purple SaaS palette.
- No generic stat-card grid with thick shadows.
- No decorative gradient blobs.
- No over-rounded 24px app cards on dense admin pages.
- No numeric sidebar markers as the primary nav visual; use line icons.
