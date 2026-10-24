// Seeds the Shopify dev store with CBA content via the Admin GraphQL API.
// Idempotent: definitions are created if missing; products, pages, entries and menus are upserted by handle.
//
// Usage (log in through the browser once, then seed; SHOPIFY_STORE comes from .env):
//   npx @shopify/cli store auth --store your-store.myshopify.com --scopes <SCOPES below, comma-separated>
//   node scripts/seed.mjs
// Preview only:
//   node scripts/seed.mjs --dry-run
//
// Scopes:
//   write_products, write_publications, write_metaobject_definitions, write_metaobjects,
//   write_content, write_online_store_pages, write_online_store_navigation (+ matching read_ scopes)
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const DRY = process.argv.includes('--dry-run');

const API_VERSION = '2026-07';

// Load .env if present (KEY=value lines).
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const STORE = process.env.SHOPIFY_STORE;
// Optional: a real Admin API token makes the script call the API directly; otherwise it goes through Shopify CLI.
const TOKEN = /^shpat_(?!x+$)/.test(process.env.SHOPIFY_ADMIN_TOKEN || '') ? process.env.SHOPIFY_ADMIN_TOKEN : null;
const CLI = !TOKEN;
if (!DRY && !STORE) {
  console.error('Set SHOPIFY_STORE in .env (or use --dry-run).');
  process.exit(1);
}

let dryId = 0;
async function gql(query, variables = {}) {
  if (DRY) {
    const name = (query.match(/(mutation|query)\s*(\w*)[^{]*\{\s*(\w+)/) || [])[3];
    console.log(`[dry-run] ${name}`, JSON.stringify(variables).slice(0, 220));
    return new Proxy({}, { get: () => dryProxy() });
  }
  if (CLI) return cliExecute(query, variables);
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}
// Runs one operation through `shopify store execute`, reusing the session from `shopify store auth`.
const tmp = CLI ? mkdtempSync(join(tmpdir(), 'cba-seed-')) : null;
process.on('exit', () => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });
// Uses a global `shopify` binary when present, otherwise `npx @shopify/cli`.
let shopifyCmd = null;
function runShopify(args) {
  if (!shopifyCmd) {
    const probe = spawnSync('shopify', ['version'], { encoding: 'utf8' });
    shopifyCmd = probe.error ? ['npx', ['-y', '@shopify/cli@latest']] : ['shopify', []];
    if (probe.error) console.log('  (Shopify CLI not installed globally; using npx @shopify/cli)');
  }
  const r = spawnSync(shopifyCmd[0], [...shopifyCmd[1], ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`Could not run Shopify CLI: ${r.error.message}`);
  return r;
}
function cliExecute(query, variables) {
  const q = join(tmp, 'op.graphql'), v = join(tmp, 'vars.json');
  writeFileSync(q, query);
  writeFileSync(v, JSON.stringify(variables));
  const args = ['store', 'execute', '--store', STORE, '--query-file', q, '--variable-file', v, '--version', API_VERSION, '--json', '--no-input'];
  if (/^\s*mutation/.test(query)) args.push('--allow-mutations');
  const r = runShopify(args);
  // Output: one-line JSON progress events, then the result (pretty-printed JSON) or an {"error": ...} object.
  const rest = `${r.stdout || ''}`.split('\n').filter((l) => {
    const t = l.trim();
    if (!t.startsWith('{"type":"progress"')) return true;
    try { return JSON.parse(t).type !== 'progress'; } catch { return true; }
  }).join('\n').trim();
  let result = null;
  try { result = rest ? JSON.parse(rest.slice(rest.indexOf('{'))) : null; } catch { result = null; }
  if (!result || result.error || r.status !== 0) {
    const detail = `${r.stderr || ''}`.replace(/[│╭╮╰╯─]/g, '').replace(/[ \t]+/g, ' ').trim();
    const msg = (result && result.error ? `${result.error.message}${(result.error.nextSteps || []).map((n) => `\n  → ${n}`).join('')}` : 'unknown error') + (detail ? `\n${detail}` : '');
    console.error(`\nshopify store execute failed:\n${msg}`);
    process.exit(1);
  }
  if (result.errors) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.data || result;
}
// In dry-run, any property chain resolves to a fake object with an id and empty arrays.
function dryProxy() {
  const id = `gid://shopify/Dry/${++dryId}`;
  return new Proxy({ id, nodes: [], edges: [], userErrors: [] }, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : dryProxy()) });
}
function check(result, label) {
  const errs = (result && result.userErrors) || [];
  const real = errs.filter((e) => e.code !== 'TAKEN' && !/already (exists|been taken)|in use/i.test(e.message));
  if (real.length) console.warn(`  ! ${label}:`, real.map((e) => `${(e.field || []).join('.')} ${e.message}`).join('; '));
  return result;
}

/* ------------------------------------------------------------------ */
/* Content                                                            */
/* ------------------------------------------------------------------ */
const catalog = read('content/courses.json');
const college = read('content/college.json');
const trivia = read('content/trivia.json');
const faqs = read('content/faqs.json');
const samples = read('content/samples.json');
const programs = readdirSync(join(root, 'content/programs')).filter((f) => f.endsWith('.json')).map((f) => read(`content/programs/${f}`));
const PROGRAM_ORDER = ['bsba-business-management', 'bsba-financial-management', 'bsba-marketing-management', 'bsba-human-resource-management', 'bs-entrepreneurship', 'bs-management-accounting'];
programs.sort((a, b) => PROGRAM_ORDER.indexOf(a.handle) - PROGRAM_ORDER.indexOf(b.handle));

const displayCode = (code) => {
  if (/^PATHFit \d$/.test(code)) return `${code} M / W`;
  if (/^NSTP \d$/.test(code)) return `${code} (CWTS / LTS / ROTC)`;
  return code;
};
const course = ([code, lec, lab, units, prereq]) => ({
  code: displayCode(code),
  title: catalog[code] || '',
  lec, lab, units,
  prereq: (prereq || '').replace(/\bPATHFit (\d)\b/g, 'PATHFit $1')
});
const expandCurricula = (p) => p.curricula.map((c) => ({
  label: c.label, note: c.note || '', cmo_basis: c.cmo_basis, revision: c.revision, effective: c.effective, grand_total: c.grand_total,
  years: c.years.map((y) => ({ year: y.year, terms: y.terms.map((t) => ({ name: t.name, subtotal: t.subtotal, courses: t.courses.map(course) })) }))
}));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ */
/* Definitions                                                        */
/* ------------------------------------------------------------------ */
const PRODUCT_METAFIELDS = [
  ['abbreviation', 'Abbreviation', 'single_line_text_field'],
  ['tagline', 'Tagline', 'single_line_text_field'],
  ['degree_type', 'Degree type (BSBA / BS)', 'single_line_text_field'],
  ['duration', 'Duration', 'single_line_text_field'],
  ['total_units', 'Total credit units', 'number_integer'],
  ['who_for', "Who it's for", 'multi_line_text_field'],
  ['accreditation', 'Accreditation badges', 'list.single_line_text_field'],
  ['careers', 'Career paths', 'list.single_line_text_field'],
  ['curricula', 'Curricula (JSON)', 'json'],
  ['electives', 'Electives (JSON)', 'json'],
  ['tracks', 'Specialized tracks (JSON)', 'json'],
  ['tuition', 'Tuition table (JSON)', 'json']
];

const f = (key, name, type, extra = {}) => ({ key, name, type, ...extra });
const METAOBJECTS = [
  { type: 'cba_trivia', name: 'Trivia', displayNameKey: 'fact', fieldDefinitions: [
    f('fact', 'Fact', 'multi_line_text_field', { required: true }), f('source', 'Source', 'single_line_text_field') ] },
  { type: 'cba_review', name: 'Review', displayNameKey: 'name', fieldDefinitions: [
    f('name', 'Display name', 'single_line_text_field', { required: true }),
    f('program', 'Program', 'product_reference'),
    f('rating', 'Rating (1–5)', 'number_integer', { required: true, validations: [{ name: 'min', value: '1' }, { name: 'max', value: '5' }] }),
    f('body', 'Review', 'multi_line_text_field', { required: true }),
    f('year_level', 'Year level / batch', 'single_line_text_field'),
    f('date', 'Date', 'date'),
    f('published', 'Published', 'boolean') ] },
  { type: 'cba_testimonial', name: 'Testimonial', displayNameKey: 'name', fieldDefinitions: [
    f('quote', 'Quote', 'multi_line_text_field', { required: true }), f('name', 'Name', 'single_line_text_field', { required: true }),
    f('role', 'Role', 'single_line_text_field'), f('program', 'Program', 'product_reference'), f('photo', 'Photo', 'file_reference') ] },
  { type: 'cba_campaign', name: 'Campaign', displayNameKey: 'title', fieldDefinitions: [
    f('title', 'Title', 'single_line_text_field', { required: true }),
    f('type', 'Type', 'single_line_text_field', { required: true, validations: [{ name: 'choices', value: JSON.stringify(['Enrollment', 'Event', 'Announcement']) }] }),
    f('body', 'Body', 'multi_line_text_field'), f('image', 'Poster / image', 'file_reference'),
    f('start_date', 'Start date', 'date'), f('end_date', 'End date', 'date'),
    f('cta_label', 'Button label', 'single_line_text_field'), f('cta_url', 'Button link (e.g. /pages/contact)', 'single_line_text_field'),
    f('featured', 'Featured (shows in announcement bar)', 'boolean') ] },
  { type: 'cba_faq', name: 'FAQ', displayNameKey: 'question', fieldDefinitions: [
    f('question', 'Question', 'single_line_text_field', { required: true }),
    f('answer', 'Answer', 'multi_line_text_field', { required: true }),
    f('category', 'Category', 'single_line_text_field', { required: true, validations: [{ name: 'choices', value: JSON.stringify(['Admissions', 'Programs', 'Tuition & Scholarships', 'Academic Policies', 'Student Life']) }] }) ] }
];

async function ensureDefinitions() {
  console.log('• Metafield definitions (product, namespace cba)');
  for (const [key, name, type] of PRODUCT_METAFIELDS) {
    const d = await gql(`mutation($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { field message code } } }`,
      { d: { namespace: 'cba', key, name, type, ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } } });
    check(d.metafieldDefinitionCreate, `metafield ${key}`);
  }
  console.log('• Metaobject definitions');
  for (const def of METAOBJECTS) {
    const d = await gql(`mutation($d: MetaobjectDefinitionCreateInput!) { metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message code } } }`,
      { d: { ...def, access: { storefront: 'PUBLIC_READ' } } });
    check(d.metaobjectDefinitionCreate, `metaobject ${def.type}`);
  }
}

/* ------------------------------------------------------------------ */
/* Products, collection, publishing                                   */
/* ------------------------------------------------------------------ */
let onlineStoreId;
async function onlineStore() {
  if (onlineStoreId) return onlineStoreId;
  const d = await gql(`{ publications(first: 25) { nodes { id catalog { title } } } }`);
  const pub = d.publications.nodes.find((p) => /online store/i.test((p.catalog && p.catalog.title) || ''));
  onlineStoreId = pub ? pub.id : null;
  if (!onlineStoreId && !DRY) console.warn('  ! Online Store publication not found; items will not be published.');
  return onlineStoreId;
}
async function publish(id) {
  const pub = await onlineStore();
  if (!pub) return;
  const d = await gql(`mutation($id: ID!, $p: ID!) { publishablePublish(id: $id, input: [{ publicationId: $p }]) { userErrors { field message } } }`, { id, p: pub });
  check(d.publishablePublish, 'publish');
}

async function upsertProduct(p) {
  const metafields = [
    ['abbreviation', 'single_line_text_field', p.abbreviation],
    ['tagline', 'single_line_text_field', p.tagline],
    ['degree_type', 'single_line_text_field', p.degree_type],
    ['duration', 'single_line_text_field', p.duration],
    ['total_units', 'number_integer', String(p.curricula[0].grand_total[2])],
    ['who_for', 'multi_line_text_field', p.who_for],
    ['accreditation', 'list.single_line_text_field', JSON.stringify(p.accreditation || [])],
    ['careers', 'list.single_line_text_field', JSON.stringify(p.careers || [])],
    ['curricula', 'json', JSON.stringify(expandCurricula(p))],
    ['tuition', 'json', JSON.stringify(p.tuition)]
  ];
  if (p.electives) metafields.push(['electives', 'json', JSON.stringify({ choose: p.electives.choose, courses: p.electives.courses.map(course) })]);
  if (p.tracks) metafields.push(['tracks', 'json', JSON.stringify(p.tracks.map((t) => ({ name: t.name, rule: t.rule, courses: t.courses.map(course) })))]);

  const input = {
    title: p.title,
    handle: p.handle,
    descriptionHtml: `<p>${esc(p.overview)}</p>`,
    productType: 'Degree program',
    vendor: 'CPU College of Business and Accountancy',
    tags: [p.degree_type, p.abbreviation, 'program'],
    status: 'ACTIVE',
    seo: { title: `${p.title} | CPU College of Business and Accountancy`, description: `${p.tagline} ${p.curricula[0].grand_total[2]} units, 4 years. Curriculum, electives, careers and inquiries.`.slice(0, 320) },
    metafields: metafields.map(([key, type, value]) => ({ namespace: 'cba', key, type, value }))
  };
  const found = await gql(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id } }`, { h: p.handle });
  let id = found.productByIdentifier && found.productByIdentifier.id;
  if (id) {
    const d = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id } userErrors { field message } } }`, { p: { id, ...input } });
    check(d.productUpdate, `update ${p.handle}`);
  } else {
    const d = await gql(`mutation($p: ProductCreateInput!) { productCreate(product: $p) { product { id } userErrors { field message } } }`, { p: input });
    check(d.productCreate, `create ${p.handle}`);
    id = d.productCreate.product && d.productCreate.product.id;
  }
  if (id) await publish(id);
  console.log(`  ✓ ${p.handle}`);
  return id;
}

async function upsertCollection(productIds) {
  const found = await gql(`query { collectionByIdentifier(identifier: { handle: "programs" }) { id } }`);
  let id = found.collectionByIdentifier && found.collectionByIdentifier.id;
  const base = { title: 'Programs', handle: 'programs', sortOrder: 'MANUAL', descriptionHtml: '<p>Undergraduate programs of the College of Business and Accountancy, Central Philippine University.</p>' };
  if (!id) {
    const d = await gql(`mutation($c: CollectionCreateInput!) { collectionCreate(collection: $c) { collection { id } userErrors { field message } } }`, { c: base });
    check(d.collectionCreate, 'collection');
    id = d.collectionCreate.collection && d.collectionCreate.collection.id;
  }
  if (id) {
    const d = await gql(`mutation($id: ID!, $p: [ID!]!) { collectionAddProducts(id: $id, productIds: $p) { userErrors { field message } } }`, { id, p: productIds });
    check(d.collectionAddProducts, 'collection add');
  }
  if (id) {
    await gql(`mutation($id: ID!, $m: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $m) { userErrors { field message } } }`,
      { id, m: productIds.map((pid, i) => ({ id: pid, newPosition: String(i) })) });
    await publish(id);
  }
  console.log('  ✓ collection programs');
  return id;
}

/* ------------------------------------------------------------------ */
/* Metaobject entries                                                 */
/* ------------------------------------------------------------------ */
const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
async function upsertEntry(type, handle, fields) {
  const d = await gql(`mutation($h: MetaobjectHandleInput!, $m: MetaobjectUpsertInput!) { metaobjectUpsert(handle: $h, metaobject: $m) { metaobject { id } userErrors { field message code } } }`,
    { h: { type, handle }, m: { fields: Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([key, value]) => ({ key, value: String(value) })) } });
  check(d.metaobjectUpsert, `${type}/${handle}`);
}

async function seedEntries(productIdByHandle) {
  console.log('• Trivia');
  for (const [i, t] of trivia.entries()) await upsertEntry('cba_trivia', `fact-${String(i + 1).padStart(2, '0')}`, { fact: t.fact, source: t.source });
  console.log('• FAQs');
  for (const q of faqs) await upsertEntry('cba_faq', slug(q.q), { question: q.q, answer: q.a, category: q.category });
  console.log('• Reviews (sample)');
  for (const [i, r] of samples.reviews.entries()) {
    await upsertEntry('cba_review', `sample-review-${i + 1}`, { name: r.name, program: productIdByHandle[r.program], rating: r.rating, body: r.body, year_level: r.year_level, date: r.date, published: 'true' });
  }
  console.log('• Testimonials (sample)');
  for (const [i, t] of samples.testimonials.entries()) {
    await upsertEntry('cba_testimonial', `sample-testimonial-${i + 1}`, { quote: t.quote, name: t.name, role: t.role, program: productIdByHandle[t.program] });
  }
  console.log('• Campaigns (sample)');
  for (const c of samples.campaigns) {
    await upsertEntry('cba_campaign', c.handle, { title: c.title, type: c.type, body: c.body, start_date: c.start_date, end_date: c.end_date, cta_label: c.cta_label, cta_url: c.cta_url, featured: c.featured ? 'true' : 'false' });
  }
}

/* ------------------------------------------------------------------ */
/* Pages, blog, articles                                              */
/* ------------------------------------------------------------------ */
const PAGES = [
  { handle: 'about', title: 'About the College', templateSuffix: 'about', body: `<p>${esc(college.introduction[0])}</p>` },
  { handle: 'contact', title: 'Contact us', templateSuffix: 'contact', body: '<p>Contact the College of Business and Accountancy, Central Philippine University, Jaro, Iloilo City.</p>' },
  { handle: 'reviews', title: 'Ratings & Reviews', templateSuffix: 'reviews', body: '<p>Student and alumni ratings and reviews of CBA programs.</p>' },
  { handle: 'advertisements', title: 'News & Events', templateSuffix: 'advertisements', body: '<p>Enrollment campaigns, events and announcements.</p>' },
  { handle: 'faqs', title: 'FAQs', templateSuffix: 'faq', body: '<p>Frequently asked questions about admissions, programs, tuition, policies and student life.</p>' },
  { handle: 'policies', title: 'Policies', templateSuffix: 'policies', body: '' },
  { handle: 'welcome', title: 'Welcome', templateSuffix: 'welcome', body: '' }
];
async function upsertPage(p) {
  const found = await gql(`query { pages(first: 250) { nodes { id handle } } }`);
  const match = found.pages.nodes.find((n) => n.handle === p.handle);
  const id = match && match.id;
  const input = { title: p.title, handle: p.handle, body: p.body, templateSuffix: p.templateSuffix, isPublished: true };
  if (id) {
    const d = await gql(`mutation($id: ID!, $p: PageUpdateInput!) { pageUpdate(id: $id, page: $p) { page { id } userErrors { field message } } }`, { id, p: input });
    check(d.pageUpdate, `page ${p.handle}`);
    console.log(`  ✓ page ${p.handle}`);
    return id;
  }
  const d = await gql(`mutation($p: PageCreateInput!) { pageCreate(page: $p) { page { id } userErrors { field message } } }`, { p: input });
  check(d.pageCreate, `page ${p.handle}`);
  console.log(`  ✓ page ${p.handle}`);
  return d.pageCreate.page && d.pageCreate.page.id;
}

async function upsertBlog() {
  const found = await gql(`query { blogs(first: 50) { nodes { id handle } } }`);
  const blog = found.blogs.nodes.find((b) => b.handle === 'stories');
  let id = blog && blog.id;
  if (!id) {
    const d = await gql(`mutation($b: BlogCreateInput!) { blogCreate(blog: $b) { blog { id } userErrors { field message } } }`, { b: { title: 'Stories', handle: 'stories' } });
    check(d.blogCreate, 'blog');
    id = d.blogCreate.blog && d.blogCreate.blog.id;
  }
  const timelineHtml = college.timeline.map((m) => `<h3>${esc(m.year)}: ${esc(m.title)}</h3><p>${esc(m.text)}</p>`).join('');
  for (const s of samples.stories) {
    const handle = slug(s.title);
    const body = s.body_from === 'timeline' ? `<p>${esc(s.excerpt)}</p>${timelineHtml}<p><em>Source: CBA Student Handbook, revised August 2024.</em></p>` : s.body;
    const existing = id ? await gql(`query($id: ID!) { blog(id: $id) { articles(first: 250) { nodes { id handle } } } }`, { id }) : null;
    const hit = existing && existing.blog && existing.blog.articles.nodes.find((a) => a.handle === handle);
    const aid = hit && hit.id;
    const input = { title: s.title, handle, body, summary: `<p>${esc(s.excerpt)}</p>`, tags: s.tags, isPublished: true, author: { name: 'CBA Office' } };
    if (aid) {
      const { author, ...upd } = input;
      const d = await gql(`mutation($id: ID!, $a: ArticleUpdateInput!) { articleUpdate(id: $id, article: $a) { article { id } userErrors { field message } } }`, { id: aid, a: upd });
      check(d.articleUpdate, `article ${handle}`);
    } else {
      const d = await gql(`mutation($a: ArticleCreateInput!) { articleCreate(article: $a) { article { id } userErrors { field message } } }`, { a: { ...input, blogId: id } });
      check(d.articleCreate, `article ${handle}`);
    }
  }
  console.log('  ✓ blog stories');
  return id;
}

/* ------------------------------------------------------------------ */
/* Navigation                                                         */
/* ------------------------------------------------------------------ */
async function upsertMenu(handle, title, items) {
  const found = await gql(`query { menus(first: 50) { nodes { id handle } } }`);
  const existing = found.menus.nodes.find((m) => m.handle === handle);
  if (existing) {
    const d = await gql(`mutation($id: ID!, $t: String!, $i: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $t, items: $i) { menu { id } userErrors { field message } } }`, { id: existing.id, t: title, i: items });
    check(d.menuUpdate, `menu ${handle}`);
  } else {
    const d = await gql(`mutation($t: String!, $h: String!, $i: [MenuItemCreateInput!]!) { menuCreate(title: $t, handle: $h, items: $i) { menu { id } userErrors { field message } } }`, { t: title, h: handle, i: items });
    check(d.menuCreate, `menu ${handle}`);
  }
  console.log(`  ✓ menu ${handle}`);
}

/* ------------------------------------------------------------------ */
async function main() {
  console.log(DRY ? 'DRY RUN, nothing will be sent\n' : `Seeding ${STORE}\n`);
  await ensureDefinitions();

  console.log('• Programs');
  const productIdByHandle = {};
  for (const p of programs) productIdByHandle[p.handle] = await upsertProduct(p);
  const productIds = PROGRAM_ORDER.map((h) => productIdByHandle[h]).filter(Boolean);
  const collectionId = await upsertCollection(productIds);

  await seedEntries(productIdByHandle);

  console.log('• Pages');
  const pageId = {};
  for (const p of PAGES) pageId[p.handle] = await upsertPage(p);
  console.log('• Blog');
  const blogId = await upsertBlog();

  console.log('• Menus');
  const page = (title, h) => ({ title, type: 'PAGE', resourceId: pageId[h] });
  const programItems = programs.map((p) => ({ title: p.title.replace('Bachelor of Science in ', 'BS ').replace('BSBA Major in ', 'BSBA '), type: 'PRODUCT', resourceId: productIdByHandle[p.handle] }));
  await upsertMenu('main-menu', 'Main menu', [
    { title: 'Programs', type: 'COLLECTION', resourceId: collectionId, items: programItems },
    page('About', 'about'),
    { title: 'Stories', type: 'BLOG', resourceId: blogId },
    page('Reviews', 'reviews'),
    page('News & Events', 'advertisements'),
    page('FAQs', 'faqs'),
    page('Contact', 'contact')
  ]);
  await upsertMenu('footer-programs', 'Footer: programs', programItems);
  await upsertMenu('footer', 'Footer menu', [
    page('About the College', 'about'), page('Ratings & Reviews', 'reviews'), page('News & Events', 'advertisements'),
    page('FAQs', 'faqs'), page('Policies', 'policies'), page('Contact', 'contact'), page('Welcome', 'welcome'),
    { title: 'Search', type: 'SEARCH' }
  ]);

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
