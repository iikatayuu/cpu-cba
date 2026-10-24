# CPU College of Business and Accountancy: Shopify site

A promotional website for the College of Business and Accountancy (CBA) of Central Philippine University. It covers six programs: BSBA Business Management, Financial Management, Marketing Management, Human Resource Management, BS Entrepreneurship and BS Management Accounting. It is built as a custom Online Store 2.0 Shopify theme. Programs are Shopify products shown for information and inquiries only; there is no cart or checkout.

## Repository layout

| Path | What it is |
|---|---|
| `theme/` | The Shopify theme. Push this folder with Shopify CLI. |
| `content/` | Content transcribed from the CBA Student Handbook (revised Aug 2024), the source of truth. |
| `content/programs/*.json` | Per-program curricula. Rows are `[code, lec, lab, units, prereq]`; titles come from `content/courses.json`. |
| `scripts/build-templates.mjs` | Regenerates `theme/templates/*.json` from `content/`. |
| `scripts/seed.mjs` | Creates the programs, metafields, metaobjects, pages, blog and menus in your store through the Admin API. |

## Pages

| Page | URL | Template |
|---|---|---|
| Splash (first visit, once per session) | `/` overlay, or `/pages/welcome` | `index.json` (`splash-intro`), `page.welcome.json` |
| Homepage, with random "Did you know?" trivia | `/` | `index.json` |
| Programs (product/service listing) | `/collections/programs` | `collection.json` |
| Program detail | `/products/<handle>` | `product.json` |
| About us | `/pages/about` | `page.about.json` |
| Contact | `/pages/contact` | `page.contact.json` |
| Stories & testimonials (blog) | `/blogs/stories` | `blog.json`, `article.json` |
| Ratings & reviews | `/pages/reviews` | `page.reviews.json` |
| Advertisements (enrollment, events, announcements) | `/pages/advertisements` | `page.advertisements.json` |
| FAQs | `/pages/faqs` | `page.faq.json` |
| Search (plus predictive search in the header) | `/search` | `search.json` |
| Policies (admissions, rules, grading, honors, privacy) | `/pages/policies` | `page.policies.json` |

## Design system

- **Colors.** Central Blue `#0B2A5B`, link blue `#1D4FA8`, Centralian Gold `#F2B705`, gold text `#B98800`, cream background `#FBF7EE`, ink `#14182A`. All can be edited in *Theme settings › Colors*.
- **Type.** Fraunces (display serif) and Inter (body). Both are self-hosted in `theme/assets/`.
- **Photos.** Every image slot shows a captioned placeholder that says which photo belongs there. Each slot also has an image picker, so staff can drop in real photos from the theme editor.

## Setup

1. **Shopify CLI:** use `npx @shopify/cli …` (or install it with `npm i -g @shopify/cli`).
2. **Log in to your store once.** This opens Shopify in your browser to approve access:
   ```sh
   npx @shopify/cli store auth --store your-dev-store.myshopify.com --scopes read_products,write_products,read_publications,write_publications,read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,read_content,write_content,read_online_store_pages,write_online_store_pages,read_online_store_navigation,write_online_store_navigation
   ```
3. **Seed the store:**
   ```sh
   cp .env.example .env              # set SHOPIFY_STORE
   node scripts/seed.mjs --dry-run   # preview
   node scripts/seed.mjs
   ```
4. **Preview and publish the theme:**
   ```sh
   shopify theme dev  --path theme --store your-dev-store.myshopify.com
   shopify theme push --path theme --store your-dev-store.myshopify.com --unpublished
   ```
5. **Upload the videos.** In *Content › Files*, upload 2–3 short (about 15–30 s) campus or gym clips. Then pick them in the theme editor: *Home › Splash intro › Background video* and *Home › Video strip* blocks.
6. **Upload a sharper seal.** The bundled seal is the 150 px image from cpu.edu.ph. Upload an official high-resolution file in *Theme settings › Brand › Seal / logo*.

## Managing content (no code)

| Content | Where to edit it |
|---|---|
| Trivia, reviews, testimonials, campaigns, FAQs | *Content › Metaobjects* (Trivia, Review, Testimonial, Campaign, FAQ) |
| Announcement bar | Shows the first **featured**, non-expired Campaign. Campaigns past their end date are hidden automatically. |
| Reviews submitted on the site | Arrive by email as a contact-form submission marked "Review submission". Staff add approved ones as Review entries. |
| Program details (curriculum, electives, tracks, tuition) | Product metafields in the `cba` namespace |
| Page text (hero, about, policies, timeline, leaders) | Section and block settings in the theme editor |

If you change `content/*.json`, re-run `node scripts/build-templates.mjs` and `node scripts/seed.mjs`. Note that regenerating templates overwrites edits made in the theme editor.

## Before launch: content to replace or confirm

- **Sample content.** Reviews, testimonials, campaigns and two stories are clearly labeled samples (`content/samples.json`). Replace them with real, permissioned content.
- **Tuition.** Program-specific tuition, miscellaneous, laboratory and total fees are transcribed from the provided fee schedules. Fees may change by school year; confirm the official assessment with the CPU Accounting Office.
- **Admissions.** Requirements are summarized from cpu.edu.ph and may change each school year.
- **BSBA Business Management.** Only the **Bridging Program** curriculum was in the handbook photos, so it is labeled as such.
- **Possible handbook typos.** These were transcribed as printed; verify them with the college:
  - The BM elective Ent 3206 lists prerequisite "Fin 2101" (likely Fin 2102).
  - The HRM elective Ent 2003 is printed with 0 units (shown as 3).
- **Prerequisite rows.** A few prerequisite cells sat half a row off in the photos. They were assigned by logic and checked against unit subtotals; every semester and grand total matches the handbook.
