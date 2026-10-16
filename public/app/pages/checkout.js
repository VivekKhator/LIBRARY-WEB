import { h, icon, money, number, mount } from '../dom.js';
import { api, ApiError } from '../api.js';
import { store, commerce } from '../store.js';
import { router } from '../main.js';
import { alert, applyFieldErrors, asyncButton, badge, emptyState, spinner } from '../components/ui.js';

const stored = () => {
  try {
    return JSON.parse(sessionStorage.getItem('bb.checkout') || '{}');
  } catch {
    return {};
  }
};

export default async function checkoutPage() {
  const page = h('div', { class: 'container' });
  mount(page, spinner('Preparing checkout…'));

  const saved = stored();
  const state = {
    couponCode: saved.couponCode || '',
    shippingMethod: saved.shippingMethod || 'standard',
    addressId: null,
    newAddress: null,
    notes: '',
    payment: { cardNumber: '', cardName: store.user?.name || '', expMonth: '', expYear: '', cvc: '' },
    preview: null,
  };

  const loadPreview = async () => {
    state.preview = await api.get('/api/checkout/preview', {
      query: { couponCode: state.couponCode || undefined, shippingMethod: state.shippingMethod },
    });
    if (!state.addressId) {
      const def = state.preview.addresses.find((a) => a.isDefault) || state.preview.addresses[0];
      state.addressId = def?.id || null;
    }
  };

  try {
    await loadPreview();
  } catch (err) {
    mount(page, 
      h('div', { class: 'page-head' }, h('h1', null, 'Checkout')),
      emptyState({
        title: err instanceof ApiError && err.status === 400 ? 'Your cart is not ready' : 'Checkout unavailable',
        body: err.message,
        iconName: 'cart',
        action: h('a', { class: 'btn', href: '/cart' }, 'Back to cart'),
      }));
    return page;
  }

  const render = () => {
    const { preview } = state;
    const rules = commerce();
    const totals = preview.totals;

    // ----- step 1: address
    const addressList = h('div', { class: 'stack-sm' },
      preview.addresses.map((address) =>
        h('label', { class: `address-option${state.addressId === address.id ? ' is-selected' : ''}` },
          h('input', {
            type: 'radio', name: 'address', checked: state.addressId === address.id,
            onChange: () => { state.addressId = address.id; state.newAddress = null; render(); },
          }),
          h('div', { class: 'grow' },
            h('div', { class: 'row', style: { gap: '8px' } },
              h('b', null, address.label), address.isDefault ? badge('Default', 'brand') : null),
            h('div', { class: 'small muted' },
              `${address.fullName}, ${address.line1}${address.line2 ? `, ${address.line2}` : ''}, ${address.city} ${address.state} ${address.postalCode}, ${address.country}`),
            address.phone ? h('div', { class: 'faint tiny' }, address.phone) : null))),
      h('button', {
        class: 'btn btn--ghost btn--sm',
        onClick: () => { state.newAddress = state.newAddress ? null : blankAddress(store.user?.name); state.addressId = null; render(); },
      }, icon('plus', 15), state.newAddress ? 'Use a saved address' : 'Ship to a new address'));

    const newAddressForm = state.newAddress
      ? h('div', { class: 'form-grid', style: { marginTop: '12px' } },
        textField('Full name', state.newAddress, 'fullName', { required: true }),
        textField('Phone', state.newAddress, 'phone'),
        textField('Address line 1', state.newAddress, 'line1', { required: true, full: true }),
        textField('Address line 2', state.newAddress, 'line2', { full: true }),
        textField('City', state.newAddress, 'city', { required: true }),
        textField('State / region', state.newAddress, 'state'),
        textField('Postal code', state.newAddress, 'postalCode', { required: true }),
        textField('Country', state.newAddress, 'country', { required: true }),
        h('label', { class: 'check form-grid--full' },
          h('input', { type: 'checkbox', onChange: (e) => { state.saveAddress = e.target.checked; } }),
          h('span', null, 'Save this address to my account')))
      : null;

    // ----- step 2: shipping
    const shippingOptions = h('div', { class: 'stack-sm' },
      rules.shippingMethods.map((method) => {
        const free = method.id === 'standard' && totals.subtotalCents - totals.discountCents >= rules.freeShippingThresholdCents;
        return h('label', { class: `ship-option${state.shippingMethod === method.id ? ' is-selected' : ''}` },
          h('div', { class: 'row' },
            h('input', {
              type: 'radio', name: 'shipping', checked: state.shippingMethod === method.id,
              onChange: async () => { state.shippingMethod = method.id; await loadPreview(); render(); },
            }),
            h('div', null, h('b', null, method.label), h('div', { class: 'faint tiny' }, method.days))),
          h('b', null, free ? 'Free' : money(method.priceCents)));
      }));

    // ----- step 3: payment
    const cardNumberInput = h('input', {
      class: 'input', name: 'cardNumber', inputmode: 'numeric', autocomplete: 'cc-number',
      placeholder: '4242 4242 4242 4242', value: state.payment.cardNumber,
      onInput: (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 19);
        state.payment.cardNumber = digits;
        e.target.value = digits.replace(/(.{4})/g, '$1 ').trim();
      },
    });
    const payment = h('div', { class: 'form-grid' },
      h('div', { class: 'field form-grid--full' }, h('label', { class: 'label', for: 'cardName' }, 'Name on card'),
        h('input', {
          class: 'input', id: 'cardName', name: 'cardName', autocomplete: 'cc-name', value: state.payment.cardName,
          onInput: (e) => { state.payment.cardName = e.target.value; },
        })),
      h('div', { class: 'field form-grid--full' }, h('label', { class: 'label', for: 'cardNumber' }, 'Card number'), cardNumberInput),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'expMonth' }, 'Expiry month'),
        h('input', {
          class: 'input', id: 'expMonth', name: 'expMonth', inputmode: 'numeric', placeholder: 'MM', maxlength: '2',
          onInput: (e) => { state.payment.expMonth = e.target.value; },
        })),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'expYear' }, 'Expiry year'),
        h('input', {
          class: 'input', id: 'expYear', name: 'expYear', inputmode: 'numeric', placeholder: 'YYYY', maxlength: '4',
          onInput: (e) => { state.payment.expYear = e.target.value; },
        })),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'cvc' }, 'CVC'),
        h('input', {
          class: 'input', id: 'cvc', name: 'cvc', inputmode: 'numeric', placeholder: '123', maxlength: '4',
          onInput: (e) => { state.payment.cvc = e.target.value; },
        })),
      h('div', { class: 'test-cards form-grid--full' },
        h('b', { class: 'small' }, 'Test cards'),
        h('span', null, h('code', null, '4242 4242 4242 4242'), ' succeeds · ', h('code', null, '4000 0000 0000 0002'), ' is declined · ', h('code', null, '4000 0000 0000 0003'), ' has no funds')),
    );

    const form = h('form', { class: 'stack-lg', novalidate: true });

    const placeOrder = asyncButton(
      [icon('shield', 17), ` Pay ${money(totals.totalCents)}`],
      async () => {
        const body = {
          shippingMethod: state.shippingMethod,
          couponCode: state.couponCode || '',
          notes: state.notes,
          payment: {
            cardNumber: state.payment.cardNumber,
            cardName: state.payment.cardName,
            expMonth: Number(state.payment.expMonth),
            expYear: Number(state.payment.expYear),
            cvc: state.payment.cvc,
          },
        };
        if (state.newAddress) body.address = state.newAddress;
        else body.addressId = state.addressId;

        try {
          if (state.newAddress && state.saveAddress) {
            const created = await api.post('/api/addresses', { ...state.newAddress, label: state.newAddress.label || 'Delivery' });
            body.addressId = created.address.id;
            delete body.address;
          }
          const res = await api.post('/api/checkout', body);
          sessionStorage.removeItem('bb.checkout');
          store.setCartCount(0);
          store.success(`Order ${res.order.orderNumber} confirmed`);
          router.navigate(`/orders/${res.order.id}?placed=1`);
        } catch (err) {
          if (err.fields) {
            applyFieldErrors(form, err.fields);
            store.error(err.message);
          } else {
            store.error(err.message);
          }
          throw err;
        }
      },
      { class: 'btn--lg btn--block' },
    );

    mount(form, 
      h('section', { class: 'panel' },
        h('div', { class: 'panel__body' },
          h('div', { class: 'step-head' }, h('b', null, '1'), h('h2', null, 'Delivery address')),
          preview.addresses.length || state.newAddress ? null : alert('Add an address to continue.', 'info'),
          addressList,
          newAddressForm)),

      h('section', { class: 'panel' },
        h('div', { class: 'panel__body' },
          h('div', { class: 'step-head' }, h('b', null, '2'), h('h2', null, 'Shipping speed')),
          totals.needsShipping
            ? shippingOptions
            : alert('Your order is entirely digital, so no shipping is needed.', 'info'))),

      h('section', { class: 'panel' },
        h('div', { class: 'panel__body' },
          h('div', { class: 'step-head' }, h('b', null, '3'), h('h2', null, 'Payment')),
          payment)),

      h('section', { class: 'panel' },
        h('div', { class: 'panel__body' },
          h('div', { class: 'step-head' }, h('b', null, '4'), h('h2', null, 'Order notes (optional)')),
          h('textarea', {
            class: 'textarea', placeholder: 'Delivery instructions or a note for the seller',
            maxlength: '500', onInput: (e) => { state.notes = e.target.value; },
          }))),
    );

    const summary = h('aside', { class: 'summary stack' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel__head' }, h('h2', null, `Order summary (${number(preview.lines.length)})`)),
        h('div', { class: 'panel__body stack' },
          h('div', { class: 'stack-sm' }, preview.lines.map((line) =>
            h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '10px' } },
              h('img', {
                src: line.coverUrl || `/api/books/${line.bookId}/cover.svg`, alt: '', width: 36, height: 54,
                style: { borderRadius: '4px', objectFit: 'cover' }, loading: 'lazy',
              }),
              h('div', { class: 'grow small' },
                h('div', { class: 'strong clamp-2' }, line.title),
                h('div', { class: 'faint tiny' },
                  line.mode === 'rent' ? `Borrow ${line.rentWeeks} weeks` : `Qty ${line.quantity}`)),
              h('b', { class: 'small nowrap' }, money(line.lineCents))))),
          h('hr', { class: 'divider' }),
          h('div', { class: 'totals' },
            row('Subtotal', money(totals.subtotalCents)),
            totals.discountCents ? row(`Discount (${totals.couponCode})`, `−${money(totals.discountCents)}`, 'discount') : null,
            row('Shipping', totals.needsShipping ? (totals.shippingCents ? money(totals.shippingCents) : 'Free') : '—'),
            row('Tax', money(totals.taxCents)),
            row('Total', money(totals.totalCents), 'total')),
          placeOrder,
          h('a', { class: 'btn btn--ghost btn--block', href: '/cart' }, 'Back to cart'),
          h('p', { class: 'field__hint' }, 'This is a demonstration gateway. No real payment is taken.'))));

    mount(page, 
      h('div', { class: 'page-head' },
        h('h1', null, 'Checkout'),
        h('p', { class: 'muted' }, 'Review your delivery, shipping speed and payment before paying.')),
      h('div', { class: 'cart-layout' }, form, summary),
    );
  };

  render();
  return page;
}

const row = (label, value, variant = '') =>
  h('div', { class: `totals__row${variant ? ` totals__row--${variant}` : ''}` }, h('span', null, label), h('span', null, value));

const blankAddress = (name = '') => ({
  label: 'Delivery', fullName: name, line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States', phone: '',
});

function textField(label, model, key, { required = false, full = false } = {}) {
  const id = `addr-${key}`;
  return h('div', { class: `field${full ? ' form-grid--full' : ''}` },
    h('label', { class: 'label', for: id }, label, required ? ' *' : ''),
    h('input', {
      class: 'input', id, name: key, value: model[key] || '', required,
      onInput: (e) => { model[key] = e.target.value; },
    }));
}
