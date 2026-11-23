const offerUndo = createFuseUndo();
const merchantKey = 'spendbay-merchant-rules-v1';
function validRules(rules) {
  return Array.isArray(rules) && rules.every(rule => typeof rule?.merchant === 'string' &&
    rule.merchant.trim() && typeof rule.category === 'string' && rule.category.trim());
}
let merchantRules = [];
try {
  const saved = JSON.parse(localStorage.getItem(merchantKey));
  if (validRules(saved)) merchantRules = saved;
} catch {}
function categorize(row) {
  const description = row.description.toLowerCase();
  const rule = merchantRules.reduce((best, candidate) =>
    description.includes(candidate.merchant.toLowerCase()) &&
    (!best || candidate.merchant.length > best.merchant.length) ? candidate : best, null);
  return rule ? {...row, category: rule.category, subcategory: ''} : row;
}

const samples = {
  "sample.csv": {
    "csv": "date,description,category,amount,currency\n2026-09-02,Online orders payout,Sales,42850,INR\n2026-09-04,Packaging supplier,Operations,-3715,INR\n2026-09-18,Product photography,Marketing,-5400,INR\n2026-10-02,Wholesale order,Sales,29300,INR\n2026-10-09,Inventory restock,Inventory,-18540,INR\n2026-10-21,Courier invoices,Shipping,-2690,INR\n2026-11-05,Online orders payout,Sales,56200,INR\n2026-11-09,Workspace rent,Housing,-9500,INR\n"
  },
  "sample-bank.csv": {
    "csv": "Statement for sample student account\nTransaction Date,Narration,Withdrawal Amt.,Deposit Amt.,Balance\n01/09/2026,Monthly allowance,,₹7500,₹7500\n04/09/2026,Hostel mess top-up,₹1800,,₹5700\n13/09/2026,Lab supplies,₹385,,₹5315\n26/09/2026,Train home,₹430,,₹4885\n02/10/2026,Monthly allowance,,₹7500,₹12385\n13/10/2026,Supermarket,₹690.50,,₹11694.50\n03/11/2026,Internet bill,₹299,,₹11395.50\n"
  },
  "sample-wallet.csv": {
    "csv": "Posted Date;Merchant;Label;Transaction Type;Transaction Amount;Currency\n2026/09/25;September salary;Salary;Credit;2720;USD\n2026/10/01;Flat rent;Housing;Debit;1090;USD\n2026/10/08;Rail pass;Transport;Debit;146.20;USD\n2026/10/17;Supermarket;Groceries;Debit;83.65;USD\n2026/10/26;October salary;Salary;Credit;2720;USD\n2026/11/01;Flat rent;Housing;Debit;1090;USD\n2026/11/13;Electricity and gas;Utilities;Debit;102.40;USD\n"
  },
  "sample-investor.csv": {
    "csv": "Date|Details|Category|Amount (USD)\n2026-09-09|Realized gain on ETF sale|Realized gain|$245.00\n2026-09-19|Closed semiconductor position|Realized loss|-$820.45\n2026-10-04|Broker exchange fees|Fees|-$26.50\n2026-10-17|Dividend payment|Dividends|$52.60\n2026-11-03|Closed small-cap position|Realized loss|-$1430.20\n2026-11-12|Market data subscription|Fees|-$19.00\n"
  }
};

let ledgerCurrency = 'INR';
let money = currencyFormatter(ledgerCurrency);
function currencyFormatter(currency) {
  return new Intl.NumberFormat('en-IN', {style: 'currency', currency});
}
function majorAmount(amount) {
  return amount / 10 ** money.resolvedOptions().maximumFractionDigits;
}
function decimalAmount(amount) {
  return majorAmount(amount).toFixed(money.resolvedOptions().maximumFractionDigits);
}
const monthName = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const byId = id => document.getElementById(id);
const format = amount => money.format(majorAmount(amount));
const monthLabel = month => monthName.format(new Date(month + '-01T00:00:00Z'));
let transactions = [];
let isSampleLedger = false;
let loadVersion = 0;
let activeImport = 0;
let selectedCategory = '';

function totals(rows) {
  let income = 0;
  let expenses = 0;
  for (const row of rows) {
    if (row.amount >= 0) income += row.amount;
    else expenses -= row.amount;
  }
  return { income, expenses, net: income - expenses };
}

function label(text) {
  const item = document.createElement('li');
  const caption = document.createElement('span');
  caption.className = 'bar-label';
  caption.textContent = text;
  item.append(caption);
  return item;
}

function renderTrend() {
  const months = new Map();
  for (const row of transactions) {
    if (!months.has(row.month)) months.set(row.month, []);
    months.get(row.month).push(row);
  }
  const trend = [...months].reverse().map(([month, rows]) => [month, totals(rows)]);
  const peak = trend.reduce((max, [, data]) => Math.max(max, data.income, data.expenses), 1);
  byId('trend').replaceChildren(...trend.map(([month, data]) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'month-bar';
    button.dataset.month = month;
    const summary = monthLabel(month) + ' · ' + format(data.income) + ' income · ' + format(data.expenses) + ' expenses · ' + format(data.net) + ' net';
    button.setAttribute('aria-label', summary);
    button.title = summary;
    const plot = document.createElement('span');
    plot.className = 'bar-pair';
    plot.setAttribute('aria-hidden', 'true');
    for (const key of ['income', 'expenses']) {
      const bar = document.createElement('span');
      bar.className = 'column ' + key;
      bar.style.setProperty('--bar-height', (data[key] / peak * 100) + '%');
      plot.append(bar);
    }
    const caption = document.createElement('span');
    caption.textContent = monthLabel(month);
    button.append(plot, caption);
    button.addEventListener('click', () => {
      const input = byId('month');
      input.value = input.value === month ? '' : month;
      renderMonth();
    });
    item.append(button);
    return item;
  }));
}

const palette = ['#4e806a', '#be795f', '#8b77ad', '#b09a52', '#6888a3', '#aa727d', '#7d807b'];

function renderSpending(categories, expenses) {
  const wheel = byId('spending-wheel');
  wheel.hidden = expenses === 0;
  const list = byId('categories');
  if (!expenses) {
    list.replaceChildren(label('No expenses in this period.'));
    return;
  }
  const segments = categories.slice(0, 6);
  if (categories.length > 6) {
    const other = categories.slice(6).reduce((sum, [, amount]) => sum + amount, 0);
    segments.push(['Other categories', other]);
  }
  let subtotal = 0;
  const stops = segments.map(([, amount], index) => {
    const start = subtotal / expenses * 100;
    subtotal += amount;
    return palette[index] + ' ' + start + '% ' + (subtotal / expenses * 100) + '%';
  });
  wheel.style.background = 'conic-gradient(' + stops.join(', ') + ')';
  wheel.textContent = format(expenses);
  list.replaceChildren(...segments.map(([category, amount], index) => {
    const item = label(category + ' · ' + format(amount) + ' · ' + (amount / expenses).toLocaleString('en-IN', {style: 'percent', maximumFractionDigits: 1}));
    item.className = 'category-key';
    item.style.setProperty('--swatch', palette[index]);
    return item;
  }));
}

function renderInsights(rows, summary, categories) {
  const expenses = rows.filter(row => row.amount < 0);
  const largest = expenses.reduce((best, row) => !best || row.amount < best.amount ? row : best, null);
  byId('margin').textContent = summary.income ? (summary.net / summary.income).toLocaleString('en-IN', {style: 'percent', maximumFractionDigits: 1}) : '—';
  byId('transaction-count').textContent = rows.length.toLocaleString('en-IN');
  byId('average-expense').textContent = expenses.length ? format(Math.round(summary.expenses / expenses.length)) : '—';
  byId('largest-expense').textContent = largest ? format(-largest.amount) + ' · ' + largest.description : '—';
  byId('top-category').textContent = categories.length ? categories[0][0] + ' · ' + format(categories[0][1]) : '—';
}

function selectedRows() {
  const month = byId('month').value;
  return month ? transactions.filter(row => row.month === month) : transactions;
}

function renderTransactions(rows) {
  const query = byId('search').value.trim().toLowerCase();
  const matches = rows.filter(row => (!selectedCategory || row.category === selectedCategory) &&
    [row.description, row.category, row.subcategory].join(' ').toLowerCase().includes(query));
  byId('result-count').textContent = matches.length + ' of ' + rows.length + ' transactions';
  const fragment = document.createDocumentFragment();
  for (const row of matches) {
    const tr = fragment.appendChild(document.createElement('tr'));
    for (const value of [row.date, row.description, [row.category, row.subcategory].filter(Boolean).join(' / '), format(row.amount)]) {
      tr.insertCell().textContent = value;
    }
    tr.lastElementChild.className = row.amount < 0 ? 'negative' : 'positive';
    const actions = tr.insertCell();
    for (const [text, callback] of [['Edit', () => editEntry(row)], ['Delete', () => deleteEntry(row)]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-button';
      button.textContent = text;
      button.setAttribute('aria-label', text + ' ' + row.description + ' on ' + row.date);
      button.addEventListener('click', callback);
      actions.append(button);
    }
  }
  if (!matches.length) {
    const cell = fragment.appendChild(document.createElement('tr')).insertCell();
    cell.colSpan = 5;
    cell.textContent = 'No matching transactions.';
  }
  byId('transactions').replaceChildren(fragment);
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// React Bits Count Up behavior, adapted for this standalone HTML tracker.
function renderTotal(element, amount, animate) {
  element.textContent = format(amount);
  if (!animate || reducedMotion.matches || amount === 0) return;
  const spoken = document.createElement('span');
  spoken.className = 'sr-only';
  spoken.textContent = format(amount);
  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  visual.textContent = format(0);
  element.replaceChildren(spoken, visual);
  const start = performance.now();
  function tick(now) {
    if (!visual.isConnected) return;
    const progress = Math.min(1, (now - start) / 550);
    const value = Math.round(amount * (1 - (1 - progress) ** 3));
    visual.textContent = format(value);
    if (progress < 1 && !reducedMotion.matches) requestAnimationFrame(tick);
    else element.textContent = format(amount);
  }
  requestAnimationFrame(tick);
}

function previousMonth(month) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function renderMonthlyReview() {
  const month = byId('month').value || transactions.reduce((latest, row) => row.month > latest ? row.month : latest, '');
  const changes = byId('review-changes');
  const recurring = byId('review-recurring');
  changes.replaceChildren();
  recurring.replaceChildren();
  byId('review-detail').hidden = true;
  if (!month) return;

  const prior = previousMonth(month);
  const hasPrior = transactions.some(row => row.month === prior);
  byId('review-period').textContent = monthLabel(month) + (hasPrior
    ? ' compared with ' + monthLabel(prior)
    : ' · No transactions for ' + monthLabel(prior) + ' to compare.');
  const categories = new Map();
  const merchants = new Map();
  for (const row of transactions) {
    if (row.amount >= 0 || ![month, prior].includes(row.month)) continue;
    const merchant = row.description.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [groups, key] of [[categories, row.category], [merchants, merchant]]) {
      if (!groups.has(key)) groups.set(key, {now: [], before: []});
      groups.get(key)[row.month === month ? 'now' : 'before'].push(row);
    }
  }

  function add(list, name, detail, rows) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.onclick = () => {
      byId('review-detail-title').textContent = name + ' transactions';
      const table = byId('review-transactions');
      table.replaceChildren();
      for (const row of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
        const line = table.insertRow();
        for (const value of [row.date, row.description, format(row.amount)]) line.insertCell().textContent = value;
      }
      byId('review-detail').hidden = false;
    };
    item.append(button, document.createTextNode(' · ' + detail));
    list.append(item);
  }
  const spending = rows => rows.reduce((sum, row) => sum - row.amount, 0);
  const delta = (now, before) => now === before ? 'same as prior month'
    : format(Math.abs(now - before)) + (now > before ? ' more' : ' less');
  const ranked = [...categories].sort(([,a], [,b]) =>
    Math.abs(spending(b.now) - spending(b.before)) - Math.abs(spending(a.now) - spending(a.before)));
  for (const [category, {now, before}] of ranked) {
    const amount = spending(now);
    add(changes, category, format(amount) + (hasPrior ? ' · ' + delta(amount, spending(before)) : ''), [...now, ...before]);
  }
  for (const {now, before} of merchants.values()) {
    if (now.length !== 1 || before.length !== 1) continue;
    const interval = (Date.parse(now[0].date) - Date.parse(before[0].date)) / 86400000;
    if (interval < 25 || interval > 35) continue;
    const amount = spending(now);
    add(recurring, now[0].description, format(amount) + ' · ' + delta(amount, spending(before)), [...now, ...before]);
  }
  for (const [list, message] of [[changes, 'No expenses in this review period.'], [recurring, 'No matching monthly charges across these two months.']]) {
    if (list.children.length) continue;
    const item = document.createElement('li');
    item.textContent = message;
    list.append(item);
  }
}

function renderMonth(animate = false) {
  const rows = selectedRows();
  const summary = totals(rows);
  for (const [key, amount] of Object.entries(summary)) renderTotal(byId(key), amount, animate);
  byId('net').className = summary.net < 0 ? 'negative' : 'positive';

  const spending = new Map();
  for (const {category, amount} of rows) {
    if (amount < 0) spending.set(category, (spending.get(category) ?? 0) - amount);
  }
  const categories = [...spending].sort((a, b) => b[1] - a[1]);
  renderSpending(categories, summary.expenses);
  renderInsights(rows, summary, categories);
  renderMonthlyReview();
  for (const button of byId('trend').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.month === byId('month').value));
  }
  renderCategoryFilters(rows);
  renderTransactions(rows);
}

async function load(read, sample = false, layout) {
  const version = ++loadVersion;
  activeImport = version;
  const progress = byId('import-progress');
  progress.hidden = false;
  byId('import-phase').textContent = 'Reading CSV…';
  const status = byId('status');
  status.removeAttribute('data-error');
  status.textContent = '';
  try {
    const source = await read();
    if (version !== loadVersion) return;
    byId('import-phase').textContent = 'Matching columns and checking transactions…';
    await new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : 650));
    if (version !== loadVersion) return;
    const imported = parseCsv(source, sample ? 'INR' : ledgerCurrency, layout);
    const rows = sample ? imported.transactions : imported.transactions.map(categorize);
    const differentCurrency = transactions.length > 0 && imported.currency !== ledgerCurrency;
    const replace = sample || byId('import-mode').value === 'replace';
    if (differentCurrency && !replace) throw new Error('This CSV uses ' + imported.currency + '. Choose Replace ledger or use a CSV in ' + ledgerCurrency + '.');
    if (replace && transactions.length && !isSampleLedger && !confirm('Replace all current transactions with this CSV?')) return;
    const next = replace ? rows : [...transactions, ...rows];
    byId('search').value = '';
    selectedCategory = '';
    if (replace) byId('month').value = '';
    commitLedger(next, imported.currency, sample);
    status.textContent = !sample && imported.assumedDayFirst ? 'Ambiguous dates read as day/month/year.' : '';
  } catch (error) {
    if (version !== loadVersion) return;
    status.setAttribute('data-error', '');
    status.textContent = error.message;
  } finally {
    if (activeImport === version) progress.hidden = true;
  }
}

byId('csv').addEventListener('change', event => {
  const [file] = event.currentTarget.files;
  event.currentTarget.value = '';
  if (file) previewUpload(file);
});
for (const button of document.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    const sample = samples[button.dataset.sample];
    load(() => sample.csv, true);
  });
}
byId('month').addEventListener('change', () => renderMonth());
byId('search').addEventListener('input', () => renderTransactions(selectedRows()));

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const themeButton = byId('theme');
const root = document.documentElement;

function currentTheme() {
  return root.dataset.theme || 'dark';
}

function labelTheme() {
  themeButton.textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';
}
themeButton.addEventListener('click', () => {
  root.dataset.theme = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('finance-theme', root.dataset.theme); } catch {}
  labelTheme();
});
systemDark.addEventListener('change', labelTheme);
labelTheme();
themeButton.hidden = false;

const ledgerKey = 'finance-ledger-v1';
const defaultCategories = ['Income', 'Housing', 'Groceries', 'Transport', 'Utilities', 'Dining', 'Shopping', 'Health', 'Education', 'Entertainment', 'Work', 'Travel', 'Other'];
let editingId = null;
let idSequence = 0;
const newId = () => Date.now().toString(36) + '-' + (++idSequence) + '-' + Math.random().toString(36).slice(2);

function validateLedger(rows) {
  if (!Array.isArray(rows)) throw new Error('Saved ledger is invalid.');
  let magnitude = 0;
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      parseDate(row.date, false) !== row.date || typeof row.description !== 'string' ||
      typeof row.category !== 'string' || (row.subcategory != null && typeof row.subcategory !== 'string') ||
      !Number.isSafeInteger(row.amount)) {
      throw new Error('A transaction contains invalid data.');
    }
    magnitude += Math.abs(row.amount);
    if (!Number.isSafeInteger(magnitude)) throw new Error('The ledger exceeds the supported total.');
    if (typeof row.id !== 'string' || ids.has(row.id)) row.id = newId();
    ids.add(row.id);
    row.month = row.date.slice(0, 7);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function persistLedger() {
  try {
    localStorage.setItem(ledgerKey, JSON.stringify({version: 1, currency: ledgerCurrency, isSampleLedger, transactions}));
    byId('save-state').textContent = 'Saved in this browser.';
  } catch {
    byId('save-state').textContent = 'Browser storage is unavailable or full. Export your CSV before closing this page.';
  }
}

function commitLedger(rows, currency = ledgerCurrency, sample = false, recordUndo = true) {
  const checked = validateLedger(rows.map(row => ({...row})));
  const previous = {rows: transactions.map(row => ({...row})), currency: ledgerCurrency, sample: isSampleLedger};
  ++loadVersion;
  transactions = checked;
  isSampleLedger = sample;
  ledgerCurrency = currency;
  money = currencyFormatter(currency);
  persistLedger();
  resetEntry();
  refreshLedger();
  if (recordUndo) offerUndo(() => {
    commitLedger(previous.rows, previous.currency, previous.sample, false);
    byId('status').textContent = 'Change undone.';
  });
}

function refreshLedger() {
  const selected = byId('month').value;
  const months = [...new Set(transactions.map(row => row.month))];
  byId('month').replaceChildren(new Option('All months', ''), ...months.map(month => new Option(monthLabel(month), month)));
  byId('month').value = months.includes(selected) ? selected : '';
  byId('empty-state').hidden = transactions.length > 0;
  byId('dashboard').hidden = transactions.length === 0;
  byId('export').disabled = transactions.length === 0;
  byId('clear-ledger').disabled = transactions.length === 0;
  renderTrend();
  renderMonth();
}

function resetEntry() {
  editingId = null;
  byId('entry-form').reset();
  byId('entry-currency').value = ledgerCurrency;
  byId('entry-currency').readOnly = transactions.length > 0;
  updateAmountStep();
  const now = new Date();
  byId('entry-date').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  byId('entry-title').textContent = 'Add a transaction';
  byId('entry-save').textContent = 'Add transaction';
  byId('entry-error').hidden = true;
  refreshEntryCategories();
}

function editEntry(row) {
  editingId = row.id;
  byId('entry-date').value = row.date;
  byId('entry-type').value = row.amount < 0 ? 'expense' : 'income';
  byId('entry-amount').value = decimalAmount(Math.abs(row.amount));
  byId('entry-description').value = row.description;
  refreshEntryCategories(row.category, row.subcategory);
  byId('entry-title').textContent = 'Edit transaction';
  byId('entry-save').textContent = 'Save changes';
  byId('entry-error').hidden = true;
  byId('entry-dialog').showModal();
}

function deleteEntry(row) {
  if (confirm('Delete "' + row.description + '" (' + format(row.amount) + ')?')) {
    commitLedger(transactions.filter(entry => entry.id !== row.id));
    byId('status').textContent = 'Transaction deleted.';
  }
}

byId('entry-form').addEventListener('submit', event => {
  event.preventDefault();
  const status = byId('status');
  try {
    const currency = transactions.length ? ledgerCurrency : currencyHint(byId('entry-currency').value);
    if (!currency) throw new Error('Enter a currency code such as INR or USD.');
    const magnitude = parseMoney(byId('entry-amount').value, currency);
    const description = byId('entry-description').value.trim();
    const category = entryCategory();
    const subcategory = byId('entry-subcategory').value;
    if (!magnitude || magnitude < 0 || !description || !category) throw new Error('Enter a positive amount, description, and category.');
    const entry = {
      id: editingId || newId(),
      date: byId('entry-date').value,
      description,
      category,
      subcategory,
      amount: byId('entry-type').value === 'expense' ? -magnitude : magnitude
    };
    const editing = editingId !== null;
    commitLedger(editing ? transactions.map(row => row.id === editingId ? entry : row) : [...transactions, categorize(entry)], currency);
    status.removeAttribute('data-error');
    status.textContent = editing ? 'Transaction updated.' : 'Transaction added.';
    byId('entry-dialog').close();
    byId('entry-open').focus();
  } catch (error) {
    const feedback = byId('entry-error');
    feedback.hidden = false;
    feedback.textContent = error.message;
  }
});
byId('entry-cancel').addEventListener('click', () => byId('entry-dialog').close());
byId('clear-ledger').addEventListener('click', () => {
  if (confirm('Delete all saved transactions from this browser? Export a CSV first if you need a backup.')) {
    commitLedger([]);
    byId('status').textContent = 'Ledger cleared.';
  }
});
byId('export').addEventListener('click', () => {
  const quote = text => '"' + String(text).replaceAll('"', '""') + '"';
  const csv = ['date,description,category,subcategory,amount,currency', ...transactions.map(row =>
    [row.date, row.description, row.category, row.subcategory ?? '', decimalAmount(row.amount), ledgerCurrency].map(quote).join(',')
  )].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'finance-ledger.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
  const raw = localStorage.getItem(ledgerKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1) throw new Error('Unsupported saved ledger version.');
    transactions = validateLedger(saved.transactions);
    isSampleLedger = saved.isSampleLedger === true;
    ledgerCurrency = currencyHint(saved.currency ?? 'INR') || 'INR';
    money = currencyFormatter(ledgerCurrency);
    byId('save-state').textContent = 'Saved ledger restored.';
  }
} catch (error) {
  byId('save-state').textContent = 'Could not restore saved data. ' + error.message;
}

const subcategories = {
  Income: ['Allowance', 'Tutoring', 'Scholarship', 'Part-time work'],
  Housing: ['Rent', 'Hostel fees', 'Maintenance'],
  Food: ['Canteen', 'Mess', 'Takeout'],
  Groceries: ['Produce', 'Pantry', 'Household supplies'],
  Academics: ['Books', 'Printing', 'Lab supplies'],
  Education: ['Tuition', 'Books', 'Course materials'],
  Transport: ['Bus', 'Metro', 'Fuel'],
  Utilities: ['Mobile recharge', 'Internet', 'Electricity']
};

function entryCategory() {
  return byId('entry-category').value === '\u0001'
    ? byId('custom-category').value.trim()
    : byId('entry-category').value;
}

function refreshSubcategories(selected = '') {
  const category = entryCategory();
  const menu = byId('entry-subcategory');
  const recent = transactions.filter(row => row.category === category).map(row => row.subcategory);
  const suggested = Object.hasOwn(subcategories, category) ? subcategories[category] : [];
  const options = [...new Set([...suggested, ...recent, selected].filter(Boolean))];
  menu.replaceChildren(new Option('None', ''), ...options.map(value => new Option(value, value)));
  menu.value = selected;
}

function updateCategoryFields(selected = '') {
  const custom = byId('entry-category').value === '\u0001';
  byId('custom-category-field').hidden = !custom;
  byId('custom-category').required = custom;
  refreshSubcategories(selected);
}

function refreshEntryCategories(category = '', subcategory = '') {
  const menu = byId('entry-category');
  const categories = [...new Set([...defaultCategories, 'Food', 'Academics', ...transactions.map(row => row.category)])].sort();
  menu.replaceChildren(new Option('Choose category', ''), ...categories.map(value => new Option(value, value)), new Option('Custom category…', '\u0001'));
  menu.value = category;
  updateCategoryFields(subcategory);
}

function renderCategoryFilters(rows) {
  const group = byId('category-filters');
  const categories = [...new Set(rows.map(row => row.category))].sort();
  if (!categories.includes(selectedCategory)) selectedCategory = '';
  group.replaceChildren(...['', ...categories].map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category || 'All categories';
    button.setAttribute('aria-pressed', String(category === selectedCategory));
    button.addEventListener('click', () => {
      selectedCategory = category;
      for (const option of group.children) option.setAttribute('aria-pressed', String(option === button));
      renderTransactions(selectedRows());
    });
    return button;
  }));
}

byId('entry-open').addEventListener('click', () => {
  resetEntry();
  byId('entry-dialog').showModal();
});
byId('entry-category').addEventListener('change', () => updateCategoryFields());
byId('custom-category').addEventListener('input', () => refreshSubcategories());

for (const select of document.querySelectorAll('.glide-select')) {
  select.addEventListener('change', () => {
    if (!reducedMotion.matches) select.animate(
      [{boxShadow: '0 0 0 2px var(--accent)'}, {boxShadow: '0 0 0 0 transparent'}],
      {duration: 220, easing: 'ease-out'}
    );
  });
}

function updateAmountStep() {
  const currency = currencyHint(byId('entry-currency').value) || ledgerCurrency;
  const step = String(10 ** -currencyDigits(currency));
  byId('entry-amount').step = step;
  byId('entry-amount').min = step;
}
byId('entry-currency').addEventListener('input', updateAmountStep);
resetEntry();
refreshLedger();

const mappingKey = 'finance-csv-mappings-v1';
const mappingLabels = {
  date: 'Date', description: 'Description', category: 'Category', subcategory: 'Subcategory',
  amount: 'Signed amount', debit: 'Debit', credit: 'Credit', direction: 'Transaction type', currency: 'Currency'
};
let pendingImport;

function readMappings() {
  try {
    return JSON.parse(localStorage.getItem(mappingKey)) || {};
  } catch {
    return {};
  }
}

async function previewUpload(file) {
  const version = ++loadVersion;
  activeImport = version;
  const progress = byId('import-progress');
  progress.hidden = false;
  byId('import-phase').textContent = 'Preparing CSV preview…';
  const status = byId('status');
  try {
    const source = await file.text();
    await new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : 650));
    if (version !== loadVersion) return;
    const layout = inspectCsv(source, true);
    const signature = JSON.stringify(layout.headings.map(heading => heading.trim().toLowerCase()));
    const saved = readMappings()[signature];
    const keys = {...layout.keys};
    if (keys.subcategory === keys.category) keys.subcategory = -1;
    for (const key of Object.keys(mappingLabels)) {
      if (Number.isInteger(saved?.[key]) && saved[key] >= -1 && saved[key] < layout.width) keys[key] = saved[key];
    }
    pendingImport = {source, layout: {...layout, keys}, signature};
    byId('import-file').textContent = file.name;
    byId('remember-mapping').checked = Boolean(saved);
    const fields = Object.entries(mappingLabels).map(([key, name]) => {
      const label = document.createElement('label');
      label.textContent = name;
      const select = document.createElement('select');
      select.append(new Option('Not mapped', '-1'), ...layout.headings.map((header, index) => new Option(header || 'Column ' + (index + 1), String(index))));
      select.value = String(keys[key]);
      select.addEventListener('change', () => {
        keys[key] = Number(select.value);
        renderImportPreview();
      });
      label.append(select);
      return label;
    });
    byId('import-mapping').replaceChildren(...fields);
    status.removeAttribute('data-error');
    status.textContent = '';
    renderImportPreview();
    byId('import-dialog').showModal();
  } catch (error) {
    if (version !== loadVersion) return;
    status.setAttribute('data-error', '');
    status.textContent = error.message;
  } finally {
    if (activeImport === version) progress.hidden = true;
  }
}

function renderImportPreview() {
  const feedback = byId('import-feedback');
  const submit = byId('confirm-import');
  const table = byId('import-rows');
  table.replaceChildren();
  submit.disabled = true;
  try {
    const {source, layout} = pendingImport;
    const mapped = Object.values(layout.keys).filter(column => column >= 0);
    if (new Set(mapped).size !== mapped.length) throw new Error('Map each CSV column to a single field.');
    const result = parseCsv(source, ledgerCurrency, layout);
    const previewMoney = currencyFormatter(result.currency);
    const divisor = 10 ** currencyDigits(result.currency);
    const fingerprint = row => JSON.stringify([row.date, row.description.trim().toLowerCase(), row.amount]);
    const existing = new Set(transactions.map(fingerprint));
    const seen = new Set();
    const append = byId('import-mode').value === 'append';
    if (append && transactions.length && result.currency !== ledgerCurrency) {
      throw new Error('This CSV uses ' + result.currency + '. Choose Replace ledger to import it.');
    }
    let duplicates = 0;
    for (const row of result.transactions) {
      const key = fingerprint(row);
      if (seen.has(key) || (append && existing.has(key))) duplicates++;
      seen.add(key);
    }
    for (const row of result.transactions.slice(0, 5).map(categorize)) {
      const line = table.insertRow();
      for (const value of [row.date, row.description, row.category, previewMoney.format(row.amount / divisor)]) {
        line.insertCell().textContent = value;
      }
    }
    feedback.textContent = result.transactions.length + ' transactions detected in ' + result.currency + '.'
      + (duplicates ? ' ' + duplicates + ' possible duplicates. Review before importing.' : '');
    submit.disabled = false;
  } catch (error) {
    feedback.textContent = error.message;
  }
}

byId('import-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingImport || byId('confirm-import').disabled) return;
  const {source, layout, signature} = pendingImport;
  if (byId('remember-mapping').checked) {
    try {
      const saved = readMappings();
      saved[signature] = layout.keys;
      localStorage.setItem(mappingKey, JSON.stringify(saved));
    } catch {}
  }
  byId('import-dialog').close();
  load(() => source, false, layout);
});
byId('cancel-import').addEventListener('click', () => byId('import-dialog').close());
byId('import-dialog').addEventListener('close', () => { pendingImport = null; });

const backupStatus = byId('backup-status');
function saveRules() {
  localStorage.setItem(merchantKey, JSON.stringify(merchantRules));
}
function renderRules() {
  byId('merchant-rules').replaceChildren(...merchantRules.map((rule, index) => {
    const item = document.createElement('li');
    item.textContent = rule.merchant + ' → ' + rule.category + ' ';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.onclick = () => {
      merchantRules.splice(index, 1);
      try { saveRules(); } catch { backupStatus.textContent = 'Rules could not be saved to this browser.'; }
      renderRules();
    };
    item.append(remove);
    return item;
  }));
}
renderRules();
byId('rule-form').onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  const merchant = form.elements.merchant.value.trim().toLowerCase();
  const category = form.elements.category.value.trim();
  if (!merchant || !category) return;
  merchantRules = [...merchantRules.filter(rule => rule.merchant !== merchant), {merchant, category}];
  try { saveRules(); } catch { backupStatus.textContent = 'Rules could not be saved to this browser.'; }
  renderRules();
  form.reset();
};

async function backupKey(secret, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:600000, hash:'SHA-256'}, material,
    {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}
const encodeBackup = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const decodeBackup = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
byId('backup-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const secret = form.elements.secret.value;
  const buttons = form.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    if (event.submitter?.value === 'save') {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = new TextEncoder().encode(JSON.stringify({transactions, currency:ledgerCurrency, merchantRules, isSampleLedger}));
      const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await backupKey(secret, salt), data);
      const blob = new Blob([JSON.stringify({version:1, salt:encodeBackup(salt), iv:encodeBackup(iv),
        data:encodeBackup(new Uint8Array(encrypted))})], {type:'application/json'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'spendbay-backup.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      backupStatus.textContent = 'Encrypted backup downloaded. Keep your passphrase to restore it.';
    } else {
      const file = form.elements.backup.files[0];
      if (!file || file.size > 25 * 1024 * 1024) throw new Error('Choose a Spendbay backup under 25 MB.');
      const envelope = JSON.parse(await file.text());
      if (envelope.version !== 1) throw new Error('Unsupported backup version.');
      const salt = decodeBackup(envelope.salt), iv = decodeBackup(envelope.iv);
      if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid backup.');
      const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv}, await backupKey(secret, salt), decodeBackup(envelope.data));
      const data = JSON.parse(new TextDecoder().decode(decrypted));
      const currency = currencyHint(data.currency);
      if (!currency || !validRules(data.merchantRules)) throw new Error('Invalid backup contents.');
      validateLedger(data.transactions);
      if (!confirm('Replace the ledger and merchant rules with this backup?')) return;
      const previous = {transactions, currency:ledgerCurrency, merchantRules, isSampleLedger};
      commitLedger(data.transactions, currency, data.isSampleLedger === true, false);
      merchantRules = data.merchantRules;
      offerUndo(() => {
        commitLedger(previous.transactions, previous.currency, previous.isSampleLedger, false);
        merchantRules = previous.merchantRules;
        renderRules();
        try { saveRules(); backupStatus.textContent = 'Backup restore undone.'; }
        catch { backupStatus.textContent = 'Rules could not be saved to this browser.'; }
      });
      renderRules();
      saveRules();
      backupStatus.textContent = 'Backup restored.';
    }
    form.reset();
  } catch (error) {
    backupStatus.textContent = error.name === 'OperationError' ? 'Wrong passphrase or damaged backup.' : error.message;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
};
