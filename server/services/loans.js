import { all, get, run, transaction } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { config } from '../config.js';
import { notify } from './notifications.js';
import { formatCents } from '../lib/money.js';
import * as present from './present.js';

const LOAN_SELECT = `
  SELECT l.*, b.title, b.author, b.cover_seed FROM loans l JOIN books b ON b.id = l.book_id`;

export const listLoans = (userId, { status } = {}) => {
  const rows = all(`${LOAN_SELECT} WHERE l.user_id = ? ORDER BY l.status ASC, datetime(l.due_at) ASC`, [userId]);
  const items = rows.map(present.loan);
  const filtered = status ? items.filter((l) => (status === 'overdue' ? l.status === 'overdue' : l.status === status)) : items;
  return {
    items: filtered,
    summary: {
      active: items.filter((l) => l.status === 'active').length,
      overdue: items.filter((l) => l.status === 'overdue').length,
      returned: items.filter((l) => l.status === 'returned').length,
      dueSoon: items.filter((l) => l.status === 'active' && l.daysLeft <= 3).length,
      outstandingFeesCents: items.reduce((s, l) => s + (l.status === 'overdue' ? estimateFee(l.overdueDays) : 0), 0),
    },
  };
};

export const estimateFee = (overdueDays) => Math.max(0, overdueDays) * config.commerce.lateFeePerDayCents;

export function returnLoan(userId, loanId) {
  const loan = get(`${LOAN_SELECT} WHERE l.id = ?`, [loanId]);
  if (!loan) throw notFound('Loan not found');
  if (loan.user_id !== userId) throw forbidden('That loan belongs to another reader');
  if (loan.status === 'returned') throw badRequest('That book has already been returned');

  return transaction(() => {
    const dto = present.loan(loan);
    const fee = dto.status === 'overdue' ? estimateFee(dto.overdueDays) : 0;
    run("UPDATE loans SET status = 'returned', returned_at = datetime('now'), late_fee_cents = ? WHERE id = ?", [fee, loanId]);
    run('UPDATE books SET rent_stock = rent_stock + 1 WHERE id = ?', [loan.book_id]);
    notify(userId, {
      kind: 'loan',
      title: `Returned "${loan.title}"`,
      body: fee ? `Late fee charged: ${formatCents(fee)}` : 'Returned on time - thanks!',
      link: '/loans',
    });
    const seller = get('SELECT seller_id FROM books WHERE id = ?', [loan.book_id]);
    if (seller) notify(seller.seller_id, { kind: 'loan', title: `"${loan.title}" came back`, body: 'A rental copy is available again', link: '/seller/listings' });
    return present.loan(get(`${LOAN_SELECT} WHERE l.id = ?`, [loanId]));
  });
}

export function extendLoan(userId, loanId, weeks = 1) {
  const loan = get(`${LOAN_SELECT} WHERE l.id = ?`, [loanId]);
  if (!loan) throw notFound('Loan not found');
  if (loan.user_id !== userId) throw forbidden('That loan belongs to another reader');
  if (loan.status === 'returned') throw badRequest('That loan is already closed');
  if (loan.extensions >= config.commerce.maxRentExtensions) {
    throw badRequest(`You can extend a loan at most ${config.commerce.maxRentExtensions} times`);
  }
  const addWeeks = Math.min(4, Math.max(1, Number(weeks) || 1));
  const nextDue = new Date(new Date(loan.due_at + 'Z').getTime() + addWeeks * 7 * 86_400_000)
    .toISOString().replace('T', ' ').slice(0, 19);
  run('UPDATE loans SET due_at = ?, extensions = extensions + 1, weeks = weeks + ? WHERE id = ?', [nextDue, addWeeks, loanId]);
  notify(userId, {
    kind: 'loan',
    title: `Extended "${loan.title}" by ${addWeeks} week(s)`,
    body: `New due date: ${nextDue.slice(0, 10)}`,
    link: '/loans',
  });
  return present.loan(get(`${LOAN_SELECT} WHERE l.id = ?`, [loanId]));
}

/** Called on boot and by the daily sweep: nudges readers whose loans are due or late. */
export function sweepDueLoans() {
  const rows = all(`${LOAN_SELECT} WHERE l.status = 'active'`);
  let notified = 0;
  for (const row of rows) {
    const dto = present.loan(row);
    if (dto.status === 'overdue') {
      const existing = get(
        "SELECT id FROM notifications WHERE user_id = ? AND kind = 'loan' AND title LIKE ? AND date(created_at) = date('now')",
        [row.user_id, `Overdue: %${row.title}%`],
      );
      if (!existing) {
        notify(row.user_id, {
          kind: 'loan',
          title: `Overdue: "${row.title}"`,
          body: `${dto.overdueDays} day(s) late · fee so far ${formatCents(estimateFee(dto.overdueDays))}`,
          link: '/loans',
        });
        notified++;
      }
    } else if (dto.daysLeft <= 2) {
      const existing = get(
        "SELECT id FROM notifications WHERE user_id = ? AND kind = 'loan' AND title LIKE ? AND date(created_at) = date('now')",
        [row.user_id, `Due soon: %${row.title}%`],
      );
      if (!existing) {
        notify(row.user_id, { kind: 'loan', title: `Due soon: "${row.title}"`, body: `Due in ${dto.daysLeft} day(s)`, link: '/loans' });
        notified++;
      }
    }
  }
  return { checked: rows.length, notified };
}
