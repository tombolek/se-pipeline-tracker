# UI & Brand

## Theme Direction

- **Light theme** — white/off-white backgrounds, NOT dark mode.
- **Dominant color: Electric Purple** — primary brand color for nav, headers, CTAs, and key UI chrome.
- **Electric Pink** — used sparingly as a secondary accent (badges, highlights, active states); never as a background.
- **Typography: Poppins** — Ataccama's brand font (Poppins for headings, Poppins Light for body). Fall back to `system-ui` sans-serif if Poppins isn't loaded via Google Fonts.
- **Component approach:** shadcn/ui or Radix UI primitives, themed with Tailwind CSS custom tokens.
- **Responsive:** Desktop-first, but use Tailwind breakpoints from day one so mobile works later without a rewrite.

## Ataccama Brand Color Palette

> Extracted directly from the official Ataccama Master Deck (slide 74). Use these exact values — no approximations.

### Core Brand Colors

| Name | HEX | RGB | Usage in this app |
|------|-----|-----|-------------------|
| **Electric Purple** | `#6A2CF5` | 106, 44, 245 | **Primary** — sidebar, nav active states, primary buttons, section headers |
| Electric Purple 70% | `#9C72F8` | 156, 114, 248 | Hover states, secondary buttons, icon fills |
| Electric Purple 30% | `#DED0FD` | 222, 208, 253 | Backgrounds for callout boxes, selected row highlights |
| **Electric Pink** | `#F10090` | 241, 0, 144 | **Accent only** — overdue badges, critical alerts, manager-only labels |
| Electric Pink 70% | `#F655B5` | 246, 85, 181 | Hover on pink elements |
| Electric Pink 30% | `#FCC6E6` | 252, 198, 230 | Very light pink tint for warning backgrounds |
| **Navy** | `#1A0C42` | 26, 12, 66 | Page titles, high-emphasis text, dark section backgrounds |
| Navy 70% | `#665D81` | 102, 93, 129 | Muted body text, secondary labels |
| Navy 30% | `#CCC9D5` | 204, 201, 213 | Borders, dividers, disabled states |
| **Plum** | `#33012A` | 51, 4, 42 | Use sparingly — dark decorative elements only |
| Plum 70% | `#775671` | 119, 86, 113 | — |
| Plum 30% | `#D2C7D0` | 210, 199, 208 | — |

### Highlight / Status Colors

| Name | HEX | RGB | Usage in this app |
|------|-----|-----|-------------------|
| Highlight Red | `#FF464C` | 255, 70, 76 | Overdue tasks, error states |
| Highlight Blue | `#00DDFF` | 0, 221, 255 | Info badges, new/updated indicators |
| Highlight Yellow | `#FFAB00` | 255, 171, 0 | Due-soon warnings, caution states |
| Highlight Green | `#00E5B6` | 0, 229, 182 | Completed tasks, success states |

## Tailwind Custom Token Configuration

Configured in `tailwind.config.ts`:

```ts
colors: {
  brand: {
    purple:       '#6A2CF5',  // primary
    'purple-70':  '#9C72F8',
    'purple-30':  '#DED0FD',
    pink:         '#F10090',  // accent only
    'pink-70':    '#F655B5',
    'pink-30':    '#FCC6E6',
    navy:         '#1A0C42',
    'navy-70':    '#665D81',
    'navy-30':    '#CCC9D5',
  },
  status: {
    overdue:      '#FF464C',  // red
    warning:      '#FFAB00',  // yellow
    info:         '#00DDFF',  // blue
    success:      '#00E5B6',  // green
  }
}
```

## Color Application Rules

1. **Sidebar / top nav** — `brand.navy` background, white text, `brand.purple` active indicator.
2. **Primary buttons** — `brand.purple` fill, white text; hover: `brand.purple-70`.
3. **Page headers / section titles** — `brand.navy` text.
4. **Body text** — standard `gray-800` or `brand.navy-70` for muted labels.
5. **Row highlights / selected state** — `brand.purple-30` background.
6. **Manager-only UI elements** — `brand.pink` badge/label (use Electric Pink sparingly).
7. **Task status chips** — use the `status.*` tokens above; never use brand colors for status.
8. **Backgrounds** — white (`#FFFFFF`) for content areas; `gray-50` or `#F5F5F7` for page shell.
9. **Borders and dividers** — `brand.navy-30` (`#CCC9D5`).

## Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page / section titles | Poppins | 600 SemiBold | 20–24px |
| Card headers | Poppins | 500 Medium | 16px |
| Body text | Poppins Light | 300–400 | 14px |
| Labels / captions | Poppins Light | 300 | 12px |
| Monospace (IDs, code) | `font-mono` (system) | — | 13px |

Poppins loaded via Google Fonts in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

## Layout Decisions

- **Navigation:** collapsible sidebar (Linear/Notion style), `#1A0C42` navy background, `#6A2CF5` active indicator.
- **Pipeline view:** list view with a **slide-out drawer** for opportunity quick-view. Clicking a row opens a drawer from the right; clicking the opportunity name navigates to the full detail page.
- **Opportunity detail:** **full-width layout with 6 tabs** (Work, Timeline, Call Prep, Demo Prep, Similar Deals, Deal Info). AI Summary and MEDDPICC Gap Coach are in the header area above tabs (both collapsible, state persisted). No right column for SF data — Deal Info is its own tab.
- **Closed Lost nav item** shows a pink dot badge with unread count (iOS-style).
- **Quick Switcher modal** triggered by `Cmd/Ctrl+K` from anywhere — global opportunity search with three tiers (Favorites → Your Territory → Everything else). Matches name / account_name / sf_opportunity_id.
- **Quick-capture modal** triggered by `Cmd/Ctrl+I` from anywhere and by `+` button pinned at top of sidebar.

```
Sidebar (always visible):
  [+] Quick capture  (Cmd/Ctrl+I)
  ──────────────────
  - Home / Daily Digest
  - Pipeline
  - My Pipeline
  - Closed Lost      ← pink dot badge (unread count)
  - My Tasks
  - Inbox            ← grey count badge (unresolved items)
  ──────────────────
  [Manager only]
  Insights
    Stage Movement
    Missing Notes
    Team Workload
    Overdue Tasks
    Weekly Digest
    Team Tasks
  Settings
    Users
    Import History
    Deal Info Config
```
