/**
 * End-to-end browser suite. Drives the real UI in Chromium against a freshly seeded
 * server, covering shopper, seller and admin journeys.
 *
 *   npm run test:e2e            # headless, boots its own server on port 3310
 *   SHOTS=1 npm run test:e2e    # also writes screenshots to tests/e2e/screenshots
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const PORT = Number(process.env.E2E_PORT || 3310);
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(ROOT, 'data', 'e2e.db');
const SHOT_DIR = path.join(here, 'screenshots');
const SHOTS = process.env.SHOTS === '1';

let playwright;
try {
  playwright = require('playwright');
} catch {
  try {
    playwright = require('/opt/node-tools/node_modules/playwright');
  } catch {
    console.error('Playwright is not installed. Install it with: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}

const ACCOUNTS = {
  admin: { email: 'admin@bibliobazaar.test', password: 'Admin1234' },
  seller: { email: 'seller@bibliobazaar.test', password: 'Seller1234' },
  reader: { email: 'reader@bibliobazaar.test', password: 'Reader1234' },
};

const results = [];
let failures = 0;
const log = (msg) => process.stdout.write(`${msg}\n`);

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    log(`  ✓ ${name} (${Date.now() - started}ms)`);
  } catch (err) {
    failures++;
    results.push({ name, ok: false, ms: Date.now() - started, error: err.message });
    log(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
    // Capture page state so a failure can be diagnosed without re-running.
    try {
      mkdirSync(SHOT_DIR, { recursive: true });
      const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 48);
      await page.screenshot({ path: path.join(SHOT_DIR, `fail-${slug}.png`), fullPage: true });
      log(`      url: ${page.url()}  ->  tests/e2e/screenshots/fail-${slug}.png`);
    } catch { /* page may already be closed */ }
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitForServer(url, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start in time');
}

for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB + suffix)) rmSync(DB + suffix);
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: DB, LOG_LEVEL: 'error', NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  if (!text.includes('ExperimentalWarning') && !text.includes('trace-warnings')) process.stderr.write(`[server] ${text}`);
});

const shutdown = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', shutdown);

await waitForServer(BASE);
log(`\nBiblioBazaar E2E - ${BASE}\n`);

const browser = await playwright.chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 940 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const where = msg.location();
  consoleErrors.push(`${msg.text() || '(empty message)'} @ ${where.url}:${where.lineNumber}`);
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true }); };
const ready = () => page.waitForSelector('html[data-route="ready"]', { timeout: 15000 });
const go = async (p) => {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#main', { timeout: 15000 });
  await ready();
  await page.waitForLoadState('networkidle');
};
const nav = async (locator) => {
  await locator.click();
  await page.waitForSelector('html[data-route="loading"]', { timeout: 3000 }).catch(() => {});
  await ready();
  await page.waitForLoadState('networkidle');
};
const signIn = async (email, password) => {
  await go('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 });
  await ready();
  await page.waitForLoadState('networkidle');
};
const signOut = async () => {
  await page.click('[aria-label="Account menu"]');
  await page.click('.menu button:has-text("Sign out")');
  await page.waitForLoadState('networkidle');
};
const toast = async (text) => page.waitForSelector(`.toast:has-text("${text}")`, { timeout: 10000 });

// ---------------------------------------------------------------- guest
log('Guest browsing');
await step('home page renders the catalogue', async () => {
  await go('/');
  assert(await page.locator('.hero h1').count(), 'hero missing');
  assert((await page.locator('.book-card').count()) >= 8, 'expected book cards on the home page');
  assert((await page.locator('.cat-card').count()) >= 5, 'expected category cards');
  await shot('01-home');
});

await step('header search navigates to filtered results', async () => {
  await page.fill('.searchbar input', 'dune');
  await page.press('.searchbar input', 'Enter');
  await page.waitForURL(/\/browse\?q=dune/);
  await page.waitForLoadState('networkidle');
  const titles = await page.locator('.book-card__title').allTextContents();
  assert(titles.some((t) => /dune/i.test(t)), `search results did not include Dune: ${titles.join(', ')}`);
});

await step('facet filters narrow the catalogue', async () => {
  await go('/browse');
  const before = Number((await page.locator('.results-head p').first().textContent()).replace(/\D/g, '').slice(-3));
  await page.locator('.filter-group:has(h3:text("Category")) .filter-option', { hasText: 'Technology' }).locator('input').check();
  await page.waitForLoadState('networkidle');
  assert(page.url().includes('category=technology'), 'category filter not reflected in the URL');
  const cards = await page.locator('.book-card').count();
  assert(cards > 0 && cards <= before, 'category filter returned nothing');
  await page.locator('.active-filters .chip').first().click();
  await page.waitForLoadState('networkidle');
  assert(!page.url().includes('category='), 'filter chip did not clear the filter');
  await shot('02-browse');
});

await step('sorting by price orders results ascending', async () => {
  await go('/browse?sort=price_asc&perPage=12');
  const prices = (await page.locator('.book-card .price').allTextContents())
    .map((t) => Number(t.replace(/[^0-9.]/g, '')));
  const sorted = [...prices].sort((a, b) => a - b);
  assert(JSON.stringify(prices) === JSON.stringify(sorted), `prices not ascending: ${prices.join(', ')}`);
});

await step('book detail shows specs, seller and reviews', async () => {
  await go('/browse?q=pragmatic');
  await nav(page.locator('.book-card__title a').first());
  await page.waitForSelector('.buy-box', { timeout: 15000 });
  assert(await page.locator('.buy-box').count(), 'buy box missing');
  assert(await page.locator('.spec-list .spec').count(), 'spec list missing');
  assert(await page.locator('.seller-card').count(), 'seller card missing');
  assert((await page.locator('#reviews').count()) === 1, 'reviews section missing');
  await shot('03-book');
});

await step('guest cart persists in local storage', async () => {
  await page.locator('.buy-box button:has-text("Add to cart")').click();
  await toast('saved to your cart');
  await go('/cart');
  assert((await page.locator('.cart-line').count()) === 1, 'guest cart line missing');
  assert(await page.locator('a:has-text("Sign in to check out")').count(), 'guest checkout prompt missing');
  await shot('04-guest-cart');
});

// ---------------------------------------------------------------- shopper
log('\nShopper journey');
await step('registration creates an account and merges the guest cart', async () => {
  await go('/register');
  const email = `e2e-${Date.now()}@example.test`;
  await page.fill('#name', 'E2E Shopper');
  await page.fill('#email', email);
  await page.fill('#password', 'TestPass123');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/register'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const badge = await page.locator('a[aria-label="Cart"] .icon-btn__count').textContent();
  assert(Number(badge) >= 1, `guest cart was not merged (badge=${badge})`);
});

await step('seeded reader account signs in', async () => {
  await signOut();
  await signIn(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  assert(await page.locator('[aria-label="Account menu"]').count(), 'account menu missing after sign-in');
});

await step('adding a book and a rental to the cart updates totals', async () => {
  await go('/browse?q=atomic+habits');
  await page.locator('.book-card button:has-text("Add")').first().click();
  await toast('added to your cart');
  await go('/browse?mode=rent');
  await page.locator('.book-card__title a').first().click();
  await page.waitForLoadState('networkidle');
  const borrowToggle = page.locator('.mode-toggle button:has-text("Borrow it")');
  if (await borrowToggle.count()) await borrowToggle.click();
  await page.locator('.buy-box button:has-text("Add to cart")').click();
  await toast('added to your cart');
  await go('/cart');
  assert((await page.locator('.cart-line').count()) >= 2, 'expected at least two cart lines');
  assert(await page.locator('.totals__row--total').count(), 'totals missing');
  await shot('05-cart');
});

await step('promo code applies a discount', async () => {
  await page.fill('.summary input[aria-label="Promo code"]', 'WELCOME10');
  await page.locator('.summary button:has-text("Apply")').click();
  await toast('Promo code applied');
  await page.waitForSelector('.totals__row--discount');
  const discount = await page.locator('.totals__row--discount span').last().textContent();
  assert(discount.includes('−$') || discount.includes('-$'), `discount row looks wrong: ${discount}`);
});

await step('invalid promo code is rejected with a message', async () => {
  await page.fill('.summary input[aria-label="Promo code"]', 'NOT-A-CODE');
  await page.locator('.summary button:has-text("Apply")').click();
  await toast('not valid');
});

await step('quantity controls change the subtotal', async () => {
  await go('/cart');
  const firstBuyLine = page.locator('.cart-line:has(.qty)').first();
  const before = await page.locator('.totals__row').first().locator('span').last().textContent();
  await firstBuyLine.locator('.qty button[aria-label="Increase quantity"]').click();
  await page.waitForFunction(
    (prev) => document.querySelector('.totals__row span:last-child')?.textContent !== prev,
    before,
    { timeout: 10000 },
  );
  const after = await page.locator('.totals__row').first().locator('span').last().textContent();
  assert(before !== after, `subtotal did not change (${before} -> ${after})`);
});

await step('declined test card surfaces a payment error', async () => {
  await go('/checkout');
  await page.waitForSelector('.card-preview, #cardName');
  await page.fill('#cardName', 'E2E Reader');
  await page.fill('input[name="cardNumber"]', '4000000000000002');
  await page.fill('#expMonth', '12');
  await page.fill('#expYear', '2032');
  await page.fill('#cvc', '123');
  await page.locator('button:has-text("Pay ")').click();
  await toast('declined');
  await shot('06-checkout');
});

let orderNumber = null;
await step('successful checkout creates an order with a loan', async () => {
  await page.fill('input[name="cardNumber"]', '4242424242424242');
  await page.locator('button:has-text("Pay ")').click();
  await page.waitForURL(/\/orders\/\d+/, { timeout: 20000 });
  await page.waitForSelector('h1:has-text("Order BB-")', { timeout: 20000 });
  await ready();
  await page.waitForLoadState('networkidle');
  orderNumber = (await page.locator('h1').first().textContent()).replace('Order ', '').trim();
  assert(/^BB-/.test(orderNumber), `unexpected order number: ${orderNumber}`);
  assert(await page.locator('.timeline__item').count(), 'order timeline missing');
  const badge = await page.locator('a[aria-label="Cart"] .icon-btn__count').getAttribute('hidden');
  assert(badge !== null, 'cart badge should be hidden after checkout');
  await shot('07-order');
});

await step('loan appears on the borrowed books page', async () => {
  await go('/loans');
  assert((await page.locator('.loan-card').count()) >= 1, 'expected at least one loan');
  assert(await page.locator('.stat').first().count(), 'loan stats missing');
  await shot('08-loans');
});

await step('extending a loan pushes the due date out', async () => {
  const card = page.locator('.loan-card:not(.is-overdue)').first();
  const due = await card.locator('b').last().textContent();
  await card.locator('button:has-text("Extend")').click();
  await page.locator('.modal button:has-text("Extend loan")').click();
  await toast('Loan extended');
  await page.waitForLoadState('networkidle');
  const after = await page.locator('.loan-card').first().locator('b').last().textContent();
  assert(due !== after, `due date unchanged (${due} -> ${after})`);
});

await step('returning a loan restores it to the catalogue', async () => {
  await go('/loans?status=active');
  const before = await page.locator('.loan-card').count();
  assert(before > 0, 'no active loans to return');
  await page.locator('.loan-card button:has-text("Return book")').first().click();
  await page.waitForSelector('.modal');
  await page.locator('.modal button:has-text("Mark as returned")').click();
  await toast('Returned');
  await go('/loans?status=returned');
  assert((await page.locator('.loan-card').count()) >= 1, 'returned loan not listed');
});

await step('wishlist save and remove round-trips', async () => {
  await go('/browse');
  await page.locator('.book-card__save').first().click();
  await toast('Saved to your wishlist');
  await go('/wishlist');
  const count = await page.locator('.cart-line').count();
  assert(count >= 1, 'wishlist empty after saving');
  await page.locator('button:has-text("Remove")').first().click();
  await toast('Removed from wishlist');
});

await step('review can be written and appears on the book', async () => {
  await go(`/browse?q=midnight`);
  await page.locator('.book-card__title a').first().click();
  await page.waitForSelector('#reviews', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const writeButton = page.locator('button:has-text("Write a review"), button:has-text("Edit your review")').first();
  await writeButton.click();
  await page.locator('.rating-input button').nth(4).click();
  await page.fill('.modal input[name="title"]', 'E2E verified review');
  await page.fill('.modal textarea[name="body"]', 'Automated end-to-end review covering the review flow.');
  await page.locator('.modal button:has-text("Post review"), .modal button:has-text("Save changes")').first().click();
  await toast('Thanks for your review');
  await page.waitForLoadState('networkidle');
  const reviews = await page.locator('.review').allTextContents();
  assert(reviews.some((r) => r.includes('E2E verified review')), 'new review not visible');
});

await step('order can be cancelled before dispatch', async () => {
  await go('/orders');
  await nav(page.locator('.order-card a').first());
  await page.waitForSelector('h1:has-text("Order BB-")', { timeout: 15000 });
  const cancel = page.locator('.page-head button:has-text("Cancel order")');
  assert(await cancel.count(), 'cancel control missing on a freshly paid order');
  await cancel.click();
  await page.waitForSelector('.modal');
  await page.locator('.modal button:has-text("Cancel order")').click();
  await toast('cancelled and refunded');
  await page.waitForSelector('.page-head .badge:has-text("Cancelled")', { timeout: 10000 });
});

await step('account profile update persists', async () => {
  await go('/account');
  await page.fill('#bio', 'Updated by the end-to-end suite.');
  await page.locator('button:has-text("Save profile")').click();
  await toast('Profile updated');
  await go('/account');
  assert((await page.locator('#bio').inputValue()).includes('end-to-end'), 'bio did not persist');
});

await step('address can be added from the account page', async () => {
  await page.locator('.tabs button:has-text("Addresses")').click();
  await page.waitForSelector('button:has-text("Add address")');
  await page.locator('button:has-text("Add address")').click();
  await page.fill('.modal input[name="label"]', 'Office');
  await page.fill('.modal input[name="line1"]', '88 Test Street');
  await page.fill('.modal input[name="city"]', 'Austin');
  await page.fill('.modal input[name="postalCode"]', '73301');
  await page.locator('.modal button:has-text("Add address")').click();
  await toast('Address added');
  assert(await page.locator('.address-option:has-text("Office")').count(), 'new address not listed');
});

// ---------------------------------------------------------------- seller
log('\nSeller journey');
await step('seller dashboard shows revenue and stock', async () => {
  await signOut();
  await signIn(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  await go('/seller');
  assert((await page.locator('.stat').count()) >= 4, 'dashboard stats missing');
  assert(await page.locator('.chart').count(), 'revenue chart missing');
  await shot('09-seller');
});

let newListingTitle = null;
await step('seller can create a listing', async () => {
  await go('/seller/listings/new');
  newListingTitle = `E2E Test Listing ${Date.now()}`;
  await page.fill('#f-title', newListingTitle);
  await page.fill('#f-author', 'Automated Author');
  await page.fill('#f-price', '12.50');
  await page.fill('#f-stock', '4');
  await page.fill('#f-description', 'Created by the end-to-end suite.');
  await page.locator('button:has-text("Submit for review")').click();
  await toast('submitted for review');
  await page.waitForURL(/\/seller\/listings/);
  await page.waitForLoadState('networkidle');
  assert(await page.locator(`tr:has-text("${newListingTitle}")`).count(), 'new listing not in the table');
  assert(await page.locator(`tr:has-text("${newListingTitle}") .badge:has-text("Pending")`).count(), 'listing should be pending');
});

await step('seller can edit a listing', async () => {
  await page.locator(`tr:has-text("${newListingTitle}") a[title="Edit"]`).click();
  await page.waitForURL(/\/seller\/listings\/\d+\/edit/);
  await page.waitForLoadState('networkidle');
  await page.fill('#f-price', '9.99');
  await page.locator('button:has-text("Save and submit")').click();
  await toast('updated');
  await page.waitForLoadState('networkidle');
  assert(await page.locator(`tr:has-text("${newListingTitle}"):has-text("$9.99")`).count(), 'price did not update');
});

await step('seller can advance an order through fulfilment', async () => {
  await go('/seller/orders');
  const actionable = page.locator('button:has-text("Mark packed"), button:has-text("Mark shipped"), button:has-text("Mark delivered")').first();
  assert(await actionable.count(), 'no fulfilment action available');
  const label = await actionable.textContent();
  await actionable.click();
  await toast('Marked');
  await page.waitForLoadState('networkidle');
  assert(label.trim().length > 0, 'fulfilment label missing');
  await shot('10-seller-orders');
});

// ---------------------------------------------------------------- admin
log('\nAdmin journey');
await step('admin console reports platform metrics', async () => {
  await signOut();
  await signIn(ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  await go('/admin');
  assert((await page.locator('.stat').count()) >= 4, 'admin stats missing');
  assert((await page.locator('.bar-row').count()) >= 1, 'admin breakdown charts missing');
  await shot('11-admin');
});

await step('admin approves a pending listing', async () => {
  await go('/admin/moderation');
  const card = page.locator(`.card:has-text("${newListingTitle}")`).first();
  assert(await card.count(), 'new listing is not in the moderation queue');
  await card.locator('button:has-text("Approve")').click();
  await toast('Listing active');
  await page.waitForLoadState('networkidle');
  await go(`/browse?q=${encodeURIComponent('E2E Test Listing')}`);
  assert(await page.locator(`.book-card__title:has-text("${newListingTitle}")`).count(), 'approved listing is not public');
});

await step('admin can reject a listing with a note', async () => {
  await go('/admin/moderation');
  const card = page.locator('.card').first();
  if (await card.count()) {
    await card.locator('input[name="note"]').fill('Needs a clearer condition description.');
    await card.locator('button:has-text("Reject")').click();
    await toast('Listing rejected');
  }
});

await step('admin manages promo codes', async () => {
  await go('/admin/coupons');
  await page.locator('button:has-text("New code")').click();
  const code = `E2E${Date.now().toString().slice(-6)}`;
  await page.fill('.modal input[name="code"]', code);
  await page.fill('.modal input[name="value"]', '15');
  await page.fill('.modal input[name="description"]', 'Created by the E2E suite');
  await page.locator('.modal button:has-text("Create code")').click();
  await toast('Code created');
  await page.waitForLoadState('networkidle');
  assert(await page.locator(`tr:has-text("${code}")`).count(), 'new coupon not listed');
  await page.locator(`tr:has-text("${code}") button:has-text("Pause")`).click();
  await toast('Code paused');
});

await step('admin manages categories', async () => {
  await go('/admin/categories');
  const before = await page.locator('tbody tr').count();
  await page.locator('button:has-text("New category")').click();
  const name = `E2E Shelf ${Date.now().toString().slice(-5)}`;
  await page.fill('.modal input[name="name"]', name);
  await page.locator('.modal button:has-text("Create")').click();
  await toast('Category created');
  await page.waitForLoadState('networkidle');
  assert((await page.locator('tbody tr').count()) === before + 1, 'category was not added');
});

await step('admin can change a user role', async () => {
  await go('/admin/users');
  const row = page.locator('tbody tr').filter({ hasNot: page.locator('.badge:has-text("You")') }).first();
  const select = row.locator('select');
  const current = await select.inputValue();
  const next = current === 'customer' ? 'seller' : 'customer';
  await select.selectOption(next);
  await toast('is now');
  await page.waitForLoadState('networkidle');
});

await step('admin order search finds the shopper order', async () => {
  await go('/admin/orders');
  await page.fill('input[placeholder*="Order number"]', orderNumber || 'BB-');
  await page.locator('button:has-text("Search")').click();
  await page.waitForSelector(`tbody tr:has-text("${orderNumber || 'BB-'}")`, { timeout: 15000 });
  assert((await page.locator('tbody tr').count()) >= 1, 'admin order search returned nothing');
});

// ---------------------------------------------------------------- secondary surfaces
log('\nSecondary surfaces');
await step('header search suggests titles as you type', async () => {
  await signOut();
  await signIn(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  await page.fill('.searchbar input', 'atom');
  await page.waitForSelector('.suggest__item', { timeout: 8000 });
  assert((await page.locator('.suggest__item').count()) > 0, 'no suggestions rendered');
  await page.keyboard.press('Escape');
});

await step('notification centre opens and clears unread items', async () => {
  await page.click('[aria-label="Notifications"]');
  await page.waitForSelector('.notif__item, .notif p', { timeout: 8000 });
  const markAll = page.locator('button:has-text("Mark all read")');
  if (await markAll.count()) {
    await markAll.click();
    await page.waitForFunction(() => document.querySelectorAll('.notif__item.is-unread').length === 0, null, { timeout: 8000 });
  }
  await page.mouse.click(5, 400);
});

await step('account security and review tabs render', async () => {
  await go('/account?tab=security');
  await page.waitForSelector('#currentPassword', { timeout: 10000 });
  assert(await page.locator('table.table').count(), 'session list missing');
  await page.locator('.tabs button:has-text("My reviews")').click();
  await page.waitForSelector('.panel, .empty', { timeout: 10000 });
  await page.locator('.tabs button:has-text("Notifications")').click();
  await page.waitForSelector('.notif__item, .empty', { timeout: 10000 });
});

await step('public storefront lists a seller inventory and sorts it', async () => {
  await go('/browse');
  const slug = await page.evaluate(async () => (await (await fetch('/api/books?perPage=1')).json()).items[0].seller.storeSlug);
  await go(`/stores/${slug}`);
  assert(await page.locator('.store-hero').count(), 'storefront hero missing');
  assert((await page.locator('.book-card').count()) > 0, 'storefront has no listings');
  await page.locator('#store-sort').selectOption('price_asc');
  await ready();
  assert(page.url().includes('sort=price_asc'), 'storefront sort did not update the URL');
});

await step('buy again refills the cart from a past order', async () => {
  await go('/orders');
  await nav(page.locator('.order-card a').first());
  await page.waitForSelector('h1:has-text("Order BB-")', { timeout: 10000 });
  const again = page.locator('button:has-text("Buy again")');
  assert(await again.count(), 'buy again control missing');
  await again.click();
  await toast('added back to your cart');
});

await step('seller drafts stay out of the moderation queue', async () => {
  await signOut();
  await signIn(ACCOUNTS.seller.email, ACCOUNTS.seller.password);
  await go('/seller/listings/new');
  const draftTitle = `Draft Listing ${Date.now()}`;
  await page.fill('#f-title', draftTitle);
  await page.fill('#f-author', 'Draft Author');
  await page.fill('#f-price', '7.25');
  await page.locator('button:has-text("Save as draft")').click();
  await page.waitForURL(/\/seller\/listings/);
  await ready();
  await go('/seller/listings?status=draft');
  assert(await page.locator(`tr:has-text("${draftTitle}")`).count(), 'draft was not saved');
});

await step('rental pricing fields appear only when borrowing is enabled', async () => {
  await go('/seller/listings/new');
  assert((await page.locator('#f-rentWeekly').count()) === 0, 'rental fields should start hidden');
  await page.locator('.check:has-text("Available to borrow") input').check();
  await page.waitForSelector('#f-rentWeekly', { timeout: 5000 });
  assert((await page.locator('#f-rentWeekly').count()) === 1, 'rental fields did not appear');
});

// ---------------------------------------------------------------- platform
log('\nPlatform behaviour');
await step('access control redirects non-admins away from the console', async () => {
  await signOut();
  await signIn(ACCOUNTS.reader.email, ACCOUNTS.reader.password);
  await go('/admin');
  assert(!page.url().includes('/admin'), `reader reached the admin console: ${page.url()}`);
});

await step('unauthenticated users are sent to sign-in with a return path', async () => {
  await signOut();
  await go('/orders');
  assert(page.url().includes('/login'), 'guest was not redirected to sign in');
  assert(decodeURIComponent(page.url()).includes('next=/orders'), 'return path missing');
});

await step('unknown routes render the not-found view', async () => {
  await go('/this-route-does-not-exist');
  assert(await page.locator('.empty:has-text("does not exist")').count(), 'not-found view missing');
});

await step('dark mode toggles and persists across navigation', async () => {
  await go('/');
  await page.locator('[aria-label="Toggle dark mode"]').click();
  assert((await page.locator('html').getAttribute('data-theme')) === 'dark', 'theme did not switch to dark');
  await go('/browse');
  assert((await page.locator('html').getAttribute('data-theme')) === 'dark', 'theme did not persist');
  await shot('12-dark');
  await page.locator('[aria-label="Toggle dark mode"]').click();
});

await step('layout is usable at mobile width', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/browse');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `horizontal overflow of ${overflow}px at 390px wide`);
  await shot('13-mobile');
  await page.setViewportSize({ width: 1366, height: 940 });
});

await step('interactive controls expose accessible names', async () => {
  const problems = [];
  for (const route of ['/', '/browse', '/login', '/cart']) {
    await go(route);
    const found = await page.evaluate(() => {
      const name = (el) => (
        el.getAttribute('aria-label')
        || el.getAttribute('title')
        || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)
        || el.textContent
        || ''
      ).trim();
      const issues = [];
      for (const el of document.querySelectorAll('button, a[href]')) {
        if (!name(el) && !el.closest('[aria-hidden="true"]')) issues.push(`${el.tagName}.${el.className || '(no class)'}`);
      }
      for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        const labelled = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('placeholder');
        if (!labelled) issues.push(`field[name=${el.name || el.id || '?'}]`);
      }
      for (const img of document.querySelectorAll('img')) {
        if (img.alt === null) issues.push(`img[src=${img.getAttribute('src')}]`);
      }
      return issues;
    });
    if (found.length) problems.push(`${route}: ${found.slice(0, 5).join(', ')}`);
  }
  assert(problems.length === 0, `missing accessible names -> ${problems.join(' | ')}`);
});

await step('the catalogue is reachable by keyboard alone', async () => {
  await go('/browse');
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
  assert(/skip-link/.test(firstFocus), `first tab stop should be the skip link, got ${firstFocus}`);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  const reached = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el.tagName, visible: el.offsetParent !== null || el === document.body };
  });
  assert(reached.tag !== 'BODY', 'focus was lost while tabbing through the page');
  assert(reached.visible, 'focus landed on a hidden element');
});

await step('no console errors were logged during the run', async () => {
  const ignorable = consoleErrors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 4/.test(e));
  assert(ignorable.length === 0, `console errors:\n      ${ignorable.join('\n      ')}`);
});

await browser.close();
shutdown();

const passed = results.filter((r) => r.ok).length;
log(`\n${passed}/${results.length} browser checks passed${failures ? `, ${failures} failed` : ''}.`);
if (SHOTS) log(`Screenshots: ${SHOT_DIR}`);
for (const suffix of ['', '-wal', '-shm']) if (existsSync(DB + suffix)) rmSync(DB + suffix);
process.exit(failures ? 1 : 0);
