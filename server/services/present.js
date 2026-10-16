/** Row -> API shape mappers. Keeps snake_case in SQL and camelCase on the wire. */
const bool = (v) => Boolean(v);

export const publicUser = (row) =>
  row && {
    id: row.id,
    name: row.name,
    role: row.role,
    storeName: row.store_name || null,
    storeSlug: row.store_slug || null,
    storeBio: row.store_bio || '',
    bio: row.bio || '',
    memberSince: row.created_at,
  };

export const privateUser = (row) =>
  row && {
    ...publicUser(row),
    email: row.email,
    status: row.status,
    updatedAt: row.updated_at,
  };

export const address = (row) =>
  row && {
    id: row.id,
    label: row.label,
    fullName: row.full_name,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    phone: row.phone,
    isDefault: bool(row.is_default),
  };

export const category = (row) =>
  row && {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    bookCount: row.book_count ?? undefined,
  };

export const book = (row) =>
  row && {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    description: row.description,
    condition: row.condition,
    format: row.format,
    language: row.language,
    publisher: row.publisher,
    publishedYear: row.published_year,
    pages: row.pages,
    priceCents: row.price_cents,
    saleEnabled: bool(row.sale_enabled),
    rentEnabled: bool(row.rent_enabled),
    rentWeeklyCents: row.rent_weekly_cents,
    stock: row.stock,
    rentStock: row.rent_stock,
    status: row.status,
    moderationNote: row.moderation_note || '',
    coverUrl: row.cover_url || `/api/books/${row.id}/cover.svg`,
    coverSeed: row.cover_seed,
    views: row.views,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: row.category_id ? { id: row.category_id, name: row.category_name, slug: row.category_slug } : null,
    seller: {
      id: row.seller_id,
      name: row.seller_name,
      storeName: row.store_name || row.seller_name,
      storeSlug: row.store_slug,
    },
    rating: {
      average: row.rating_avg ? Number(row.rating_avg) : 0,
      count: row.review_count || 0,
    },
    unitsSold: row.units_sold || 0,
  };

export const cartItem = (row) =>
  row && {
    id: row.id,
    mode: row.mode,
    quantity: row.quantity,
    rentWeeks: row.rent_weeks,
    unitCents: row.mode === 'rent' ? row.rent_weekly_cents * row.rent_weeks : row.price_cents,
    lineCents: (row.mode === 'rent' ? row.rent_weekly_cents * row.rent_weeks : row.price_cents) * row.quantity,
    availableStock: row.mode === 'rent' ? row.rent_stock : row.stock,
    book: book(row),
  };

export const orderItem = (row) =>
  row && {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url || (row.book_id ? `/api/books/${row.book_id}/cover.svg` : '/api/covers/0.svg'),
    mode: row.mode,
    quantity: row.quantity,
    rentWeeks: row.rent_weeks,
    unitCents: row.unit_cents,
    lineCents: row.line_cents,
    fulfillment: row.fulfillment,
    seller: { id: row.seller_id, name: row.seller_name || null, storeName: row.store_name || row.seller_name || null },
  };

export const order = (row, items = [], events = []) =>
  row && {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    shippingCents: row.shipping_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    couponCode: row.coupon_code || null,
    shippingMethod: row.shipping_method,
    payment: { brand: row.payment_brand, last4: row.payment_last4, ref: row.payment_ref },
    address: safeJson(row.address_json),
    notes: row.notes || '',
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
    itemCount: row.item_count ?? items.length,
    customer: row.customer_name ? { id: row.user_id, name: row.customer_name, email: row.customer_email } : undefined,
    items: items.map(orderItem),
    events: events.map((e) => ({ id: e.id, label: e.label, detail: e.detail, createdAt: e.created_at })),
  };

export const loan = (row) => {
  if (!row) return null;
  const due = new Date(row.due_at + 'Z');
  const now = new Date();
  const msPerDay = 86_400_000;
  const daysLeft = Math.ceil((due - now) / msPerDay);
  const overdue = row.status === 'active' && due < now;
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    coverUrl: `/api/books/${row.book_id}/cover.svg`,
    weeks: row.weeks,
    startedAt: row.started_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    extensions: row.extensions,
    lateFeeCents: row.late_fee_cents,
    status: overdue ? 'overdue' : row.status,
    daysLeft,
    overdueDays: overdue ? Math.abs(daysLeft) : 0,
    orderId: row.order_id,
  };
};

export const review = (row, viewerId = null) =>
  row && {
    id: row.id,
    bookId: row.book_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    verified: bool(row.verified),
    helpfulCount: row.helpful_count || 0,
    votedByMe: bool(row.voted_by_me),
    mine: viewerId != null && row.user_id === viewerId,
    author: { id: row.user_id, name: row.author_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bookTitle: row.book_title,
  };

export const coupon = (row) =>
  row && {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    value: row.value,
    minSubtotalCents: row.min_subtotal_cents,
    maxDiscountCents: row.max_discount_cents,
    usageLimit: row.usage_limit,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    active: bool(row.active),
    createdAt: row.created_at,
  };

export const notification = (row) =>
  row && {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
  };

function safeJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}
