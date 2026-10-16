import { h, icon, money, number, titleCase, debounce, mount } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../main.js';
import { bookGrid } from '../components/book-card.js';
import { emptyState, pagination, skeletonGrid } from '../components/ui.js';

const asArray = (value) => (value === undefined || value === null || value === '' ? [] : [].concat(value));

function readFilters(ctx) {
  const q = ctx.queryAll;
  return {
    q: q.get('q') || '',
    category: q.get('category') || '',
    condition: q.getAll('condition'),
    format: q.getAll('format'),
    language: q.get('language') || '',
    minPrice: q.get('minPrice') || '',
    maxPrice: q.get('maxPrice') || '',
    minRating: q.get('minRating') || '',
    mode: q.get('mode') || '',
    inStock: q.get('inStock') === 'true',
    sort: q.get('sort') || 'relevance',
    page: Number(q.get('page')) || 1,
    perPage: Number(q.get('perPage')) || 12,
  };
}

export default async function browsePage(ctx) {
  const filters = readFilters(ctx);
  const page = h('div', { class: 'container' });
  const resultsHost = h('div');
  const filtersHost = h('aside', { class: 'card card--pad filters' });

  const apply = (patch, { resetPage = true } = {}) => {
    const next = { ...filters, ...patch };
    if (resetPage) next.page = 1;
    router.setQuery({
      q: next.q || '',
      category: next.category || '',
      condition: next.condition,
      format: next.format,
      language: next.language || '',
      minPrice: next.minPrice === '' ? '' : next.minPrice,
      maxPrice: next.maxPrice === '' ? '' : next.maxPrice,
      minRating: next.minRating || '',
      mode: next.mode || '',
      inStock: next.inStock ? 'true' : '',
      sort: next.sort === 'relevance' ? '' : next.sort,
      page: next.page > 1 ? next.page : '',
    });
    router.resolve({ scroll: false });
  };

  const load = async () => {
    mount(resultsHost, skeletonGrid(filters.perPage > 12 ? 12 : 8));
    const query = {
      q: filters.q || undefined,
      category: filters.category || undefined,
      condition: filters.condition,
      format: filters.format,
      language: filters.language || undefined,
      minPrice: filters.minPrice || undefined,
      maxPrice: filters.maxPrice || undefined,
      minRating: filters.minRating || undefined,
      mode: filters.mode || undefined,
      inStock: filters.inStock ? 'true' : undefined,
      sort: filters.sort,
      page: filters.page,
      perPage: filters.perPage,
      facets: '1',
    };
    const data = await api.get('/api/books', { query });
    renderFilters(data.facets);
    renderResults(data);
  };

  const renderResults = (data) => {
    const from = (data.page - 1) * data.perPage + 1;
    const to = Math.min(data.total, data.page * data.perPage);
    mount(resultsHost, 
      h('div', { class: 'results-head' },
        h('p', { class: 'muted small' },
          data.total
            ? `Showing ${number(from)}–${number(to)} of ${number(data.total)} ${data.total === 1 ? 'book' : 'books'}`
            : 'No matches'),
        h('div', { class: 'row' },
          h('label', { class: 'label', for: 'sort' }, 'Sort'),
          h('select', {
            id: 'sort', class: 'select', style: { minWidth: '190px' },
            onChange: (e) => apply({ sort: e.target.value }),
          }, (store.state.meta?.sorts || []).map((option) =>
            h('option', { value: option.value, selected: option.value === filters.sort }, option.label))))),
      activeFilterChips(),
      data.items.length
        ? h('div', { class: 'stack-lg' },
          bookGrid(data.items),
          pagination({ page: data.page, totalPages: data.totalPages, onChange: (p) => apply({ page: p }, { resetPage: false }) }))
        : emptyState({
          title: 'Nothing matched those filters',
          body: 'Try removing a filter, widening the price range, or searching for a different title.',
          iconName: 'search',
          action: h('button', { class: 'btn btn--ghost', onClick: () => clearAll() }, 'Clear all filters'),
        }),
    );
  };

  const clearAll = () =>
    apply({ q: '', category: '', condition: [], format: [], language: '', minPrice: '', maxPrice: '', minRating: '', mode: '', inStock: false });

  const activeFilterChips = () => {
    const chips = [];
    const add = (label, onRemove) =>
      chips.push(h('button', { class: 'chip', onClick: onRemove, title: 'Remove filter' },
        label, h('span', { class: 'chip__x', 'aria-hidden': 'true' }, '×')));
    if (filters.q) add(`“${filters.q}”`, () => apply({ q: '' }));
    if (filters.category) add(titleCase(filters.category.replace(/-/g, ' ')), () => apply({ category: '' }));
    filters.condition.forEach((c) => add(titleCase(c), () => apply({ condition: filters.condition.filter((x) => x !== c) })));
    filters.format.forEach((f) => add(titleCase(f), () => apply({ format: filters.format.filter((x) => x !== f) })));
    if (filters.language) add(filters.language, () => apply({ language: '' }));
    if (filters.minPrice) add(`from $${filters.minPrice}`, () => apply({ minPrice: '' }));
    if (filters.maxPrice) add(`up to $${filters.maxPrice}`, () => apply({ maxPrice: '' }));
    if (filters.minRating) add(`${filters.minRating}★ and up`, () => apply({ minRating: '' }));
    if (filters.mode) add(filters.mode === 'rent' ? 'Rentable' : 'For sale', () => apply({ mode: '' }));
    if (filters.inStock) add('In stock', () => apply({ inStock: false }));
    if (!chips.length) return h('div');
    return h('div', { class: 'active-filters', style: { marginBottom: '16px' } },
      chips,
      h('button', { class: 'btn btn--quiet btn--sm', onClick: clearAll }, 'Clear all'));
  };

  const renderFilters = (facets) => {
    const group = (title, body) => h('div', { class: 'filter-group' }, h('h3', null, title), body);
    const checkboxList = (items, selected, onToggle, labelFor = titleCase) =>
      h('div', null, items.map((item) =>
        h('label', { class: 'filter-option' },
          h('input', {
            type: 'checkbox',
            checked: selected.includes(item.value),
            onChange: () => onToggle(item.value),
          }),
          h('span', null, labelFor(item.value)),
          h('span', { class: 'count' }, number(item.count)))));

    const minPriceInput = h('input', { class: 'input', type: 'number', min: '0', step: '1', placeholder: 'Min', value: filters.minPrice, 'aria-label': 'Minimum price' });
    const maxPriceInput = h('input', { class: 'input', type: 'number', min: '0', step: '1', placeholder: 'Max', value: filters.maxPrice, 'aria-label': 'Maximum price' });
    const commitPrice = debounce(() => apply({ minPrice: minPriceInput.value, maxPrice: maxPriceInput.value }), 600);
    minPriceInput.addEventListener('input', commitPrice);
    maxPriceInput.addEventListener('input', commitPrice);

    mount(filtersHost, 
      h('div', { class: 'row-between', style: { marginBottom: '12px' } },
        h('b', { class: 'row', style: { gap: '6px' } }, icon('filter', 16), 'Filters'),
        h('button', { class: 'btn btn--quiet btn--sm', onClick: clearAll }, 'Reset')),

      group('Availability', h('div', null,
        h('label', { class: 'filter-option' },
          h('input', { type: 'checkbox', checked: filters.inStock, onChange: (e) => apply({ inStock: e.target.checked }) }),
          h('span', null, 'In stock only')),
        h('label', { class: 'filter-option' },
          h('input', { type: 'radio', name: 'mode', checked: !filters.mode, onChange: () => apply({ mode: '' }) }),
          h('span', null, 'Buy or borrow')),
        h('label', { class: 'filter-option' },
          h('input', { type: 'radio', name: 'mode', checked: filters.mode === 'buy', onChange: () => apply({ mode: 'buy' }) }),
          h('span', null, 'For sale')),
        h('label', { class: 'filter-option' },
          h('input', { type: 'radio', name: 'mode', checked: filters.mode === 'rent', onChange: () => apply({ mode: 'rent' }) }),
          h('span', null, 'Available to borrow')))),

      group('Category', h('div', null,
        h('label', { class: 'filter-option' },
          h('input', { type: 'radio', name: 'category', checked: !filters.category, onChange: () => apply({ category: '' }) }),
          h('span', null, 'All categories')),
        (facets?.categories || []).map((cat) =>
          h('label', { class: 'filter-option' },
            h('input', {
              type: 'radio', name: 'category', checked: filters.category === cat.slug,
              onChange: () => apply({ category: cat.slug }),
            }),
            h('span', null, cat.name),
            h('span', { class: 'count' }, number(cat.count)))))),

      group('Condition', checkboxList(
        facets?.conditions || [], filters.condition,
        (value) => apply({ condition: filters.condition.includes(value) ? filters.condition.filter((c) => c !== value) : [...filters.condition, value] })),
      ),

      group('Format', checkboxList(
        facets?.formats || [], filters.format,
        (value) => apply({ format: filters.format.includes(value) ? filters.format.filter((f) => f !== value) : [...filters.format, value] })),
      ),

      group('Price', h('div', { class: 'stack-sm' },
        h('div', { class: 'price-range' }, minPriceInput, h('span', { class: 'faint' }, '–'), maxPriceInput),
        facets?.priceRange?.maxCents
          ? h('p', { class: 'field__hint' }, `Listings range ${money(facets.priceRange.minCents)} – ${money(facets.priceRange.maxCents)}`)
          : null)),

      group('Rating', h('div', null,
        [0, 4, 4.5, 3].sort((a, b) => b - a).filter((v, i, arr) => arr.indexOf(v) === i).map((value) =>
          h('label', { class: 'filter-option' },
            h('input', {
              type: 'radio', name: 'minRating', checked: String(filters.minRating || 0) === String(value),
              onChange: () => apply({ minRating: value || '' }),
            }),
            h('span', null, value ? `${value}★ and up` : 'Any rating'))))),

      (facets?.languages || []).length > 1
        ? group('Language', h('div', null,
          h('label', { class: 'filter-option' },
            h('input', { type: 'radio', name: 'language', checked: !filters.language, onChange: () => apply({ language: '' }) }),
            h('span', null, 'Any language')),
          facets.languages.map((lang) =>
            h('label', { class: 'filter-option' },
              h('input', {
                type: 'radio', name: 'language', checked: filters.language === lang.value,
                onChange: () => apply({ language: lang.value }),
              }),
              h('span', null, lang.value),
              h('span', { class: 'count' }, number(lang.count))))))
        : null,
    );
  };

  mount(page, 
    h('div', { class: 'page-head' },
      h('div', { class: 'page-head__row' },
        h('div', null,
          h('h1', null, filters.q ? `Results for “${filters.q}”` : filters.mode === 'rent' ? 'Books available to borrow' : 'Browse the catalogue'),
          h('p', { class: 'muted' }, 'Every listing is graded for condition and sold by an independent seller.')))),
    h('div', { class: 'browse' }, filtersHost, resultsHost),
  );

  await load();
  return page;
}
