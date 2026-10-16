import { h, icon, money, number, dateShort, mount } from '../dom.js';
import { api } from '../api.js';
import { store, commerce } from '../store.js';
import { router } from '../main.js';
import { alert, asyncButton, badge, confirmDialog, emptyState, spinner, statCard, statusBadge, modal } from '../components/ui.js';

export default async function loansPage(ctx) {
  const page = h('div', { class: 'container' });
  const status = ctx.query.status || '';

  const load = async () => {
    const data = await api.get('/api/loans', { query: { status: status || undefined } });
    render(data);
  };

  const render = (data) => {
    const rules = commerce();
    mount(page, 
      h('div', { class: 'page-head' },
        h('div', { class: 'page-head__row' },
          h('div', null,
            h('h1', null, 'Borrowed books'),
            h('p', { class: 'muted' }, `Rentals run by the week. You can extend a loan up to ${rules.maxRentExtensions} times.`)),
          h('a', { class: 'btn btn--ghost btn--sm', href: '/browse?mode=rent' }, icon('search', 15), 'Find more to borrow'))),

      h('div', { class: 'stat-grid', style: { marginBottom: '20px' } },
        statCard({ label: 'On loan', value: number(data.summary.active), hint: 'Currently with you' }),
        statCard({ label: 'Due soon', value: number(data.summary.dueSoon), hint: 'Within 3 days' }),
        statCard({
          label: 'Overdue', value: number(data.summary.overdue),
          hint: data.summary.overdue ? `${money(data.summary.outstandingFeesCents)} in late fees` : 'Nothing late',
          accent: data.summary.overdue ? 'var(--danger-fg)' : null,
        }),
        statCard({ label: 'Returned', value: number(data.summary.returned), hint: 'Completed loans' })),

      h('div', { class: 'tabs', style: { marginBottom: '20px' } },
        [['', 'All'], ['active', 'On loan'], ['overdue', 'Overdue'], ['returned', 'Returned']].map(([value, label]) =>
          h('button', {
            'aria-selected': String(status === value),
            onClick: () => router.navigate(value ? `/loans?status=${value}` : '/loans'),
          }, label))),

      data.summary.overdue
        ? alert(`You have ${data.summary.overdue} overdue loan(s). Late fees accrue at ${money(rules.lateFeePerDayCents)} per day.`, 'error')
        : null,

      data.items.length
        ? h('div', { class: 'stack' }, data.items.map((loan) => loanCard(loan, load)))
        : emptyState({
          title: status ? `No ${status} loans` : 'You have not borrowed anything yet',
          body: 'Borrowing is ideal for textbooks and one-off reads. Look for the "Available to borrow" badge.',
          iconName: 'clock',
          action: h('a', { class: 'btn', href: '/browse?mode=rent' }, 'Books to borrow'),
        }),
    );
  };

  mount(page, spinner('Loading your loans…'));
  await load();
  return page;
}

function loanCard(loan, reload) {
  const rules = commerce();
  const overdue = loan.status === 'overdue';
  const returned = loan.status === 'returned';
  const totalDays = Math.max(1, loan.weeks * 7);
  const elapsed = Math.min(totalDays, Math.max(0, totalDays - loan.daysLeft));
  const pct = Math.round((elapsed / totalDays) * 100);

  const extend = asyncButton('Extend', async () => {
    let weeks = 1;
    const dialog = modal({
      title: `Extend “${loan.title}”`,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' },
          `Current due date ${dateShort(loan.dueAt)}. Extensions used: ${loan.extensions} of ${rules.maxRentExtensions}.`),
        h('div', { class: 'field' },
          h('label', { class: 'label', for: 'ext-weeks' }, 'Extra weeks'),
          h('select', { id: 'ext-weeks', class: 'select', onChange: (e) => { weeks = Number(e.target.value); } },
            [1, 2, 3, 4].map((w) => h('option', { value: w }, `${w} ${w === 1 ? 'week' : 'weeks'}`))))),
      footer: [
        h('button', { class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Cancel'),
        asyncButton('Extend loan', async () => {
          await api.post(`/api/loans/${loan.id}/extend`, { weeks });
          dialog.close();
          store.success('Loan extended');
          await reload();
        }),
      ],
    });
  }, { class: 'btn--ghost btn--sm', disabled: loan.extensions >= rules.maxRentExtensions });

  const returnBtn = asyncButton('Return book', async () => {
    const fee = overdue ? loan.overdueDays * rules.lateFeePerDayCents : 0;
    const ok = await confirmDialog({
      title: `Return “${loan.title}”?`,
      message: fee
        ? `This loan is ${loan.overdueDays} day(s) overdue. A late fee of ${money(fee)} will be recorded.`
        : 'The copy returns to the seller and becomes available to other readers.',
      confirmLabel: 'Mark as returned',
      danger: Boolean(fee),
    });
    if (ok) {
      await api.post(`/api/loans/${loan.id}/return`);
      store.success('Book returned - thank you');
      await reload();
    }
  }, { class: 'btn--sm' });

  return h('article', { class: `loan-card${overdue ? ' is-overdue' : ''}` },
    h('a', { href: `/books/${loan.bookId}` }, h('img', { src: loan.coverUrl, alt: '', loading: 'lazy', width: 60, height: 90 })),
    h('div', { class: 'grow stack-sm' },
      h('div', { class: 'row-between' },
        h('div', null,
          h('a', { href: `/books/${loan.bookId}`, class: 'strong' }, loan.title),
          h('div', { class: 'faint' }, loan.author)),
        h('div', { class: 'row', style: { gap: '8px' } },
          statusBadge(loan.status),
          loan.extensions ? badge(`${loan.extensions} extension(s)`) : null)),

      returned
        ? h('div', { class: 'small muted' },
          `Returned ${dateShort(loan.returnedAt)}`,
          loan.lateFeeCents ? ` · late fee ${money(loan.lateFeeCents)}` : ' · on time')
        : h('div', { class: 'stack-sm' },
          h('div', { class: 'progress' },
            h('div', {
              class: 'progress__bar',
              style: { width: `${pct}%`, background: overdue ? 'var(--danger-fg)' : undefined },
            })),
          h('div', { class: 'row-between small' },
            h('span', { class: 'muted' }, `Borrowed ${dateShort(loan.startedAt)} · ${loan.weeks} week loan`),
            h('b', { style: { color: overdue ? 'var(--danger-fg)' : undefined } },
              overdue
                ? `${loan.overdueDays} day(s) overdue · fee ${money(loan.overdueDays * rules.lateFeePerDayCents)}`
                : `Due ${dateShort(loan.dueAt)} (${loan.daysLeft} day(s) left)`))),

      returned
        ? h('a', { class: 'btn btn--ghost btn--sm', href: `/books/${loan.bookId}`, style: { justifySelf: 'start' } }, 'Borrow again')
        : h('div', { class: 'row', style: { gap: '8px' } }, returnBtn, extend,
          loan.orderId ? h('a', { class: 'btn btn--quiet btn--sm', href: `/orders/${loan.orderId}` }, 'View order') : null)),
  );
}
