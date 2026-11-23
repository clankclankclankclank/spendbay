<p align="center"><img src="brand-mark.png" alt="Spendbay logo" width="88"></p>
<h1 align="center">Spendbay</h1>
<p align="center">A lightweight, browser-based expense tracker for bank exports and everyday transactions.</p>
<p align="center"><a href="https://clankclankclankclank.github.io/spendbay/"><strong>Open Spendbay</strong></a></p>

## What you can do

- Import a bank or wallet CSV, review the detected columns and possible duplicates, and choose whether to append or replace your ledger.
- Compare income, expenses, and net cash flow. Use the monthly review to see which categories changed and open the transactions behind each change.
- Spot possible recurring expenses and compare their amounts across months. Spendbay flags matching descriptions with charges roughly a month apart.
- Add, edit, and categorize transactions manually, then export the ledger as a CSV backup.

## Try it in a minute

Choose **Salaried employee** in the app, open **Monthly review**, and select **Flat rent** to see the two transactions behind the recurring charge. The other built-in samples cover a [business owner](sample.csv), a [college student](sample-bank.csv), and [investment losses](sample-investor.csv). The [salaried employee CSV](sample-wallet.csv) is also available for import testing.

## Import your own CSV

Spendbay supports signed amounts, separate debit and credit columns, and an amount paired with a transaction type. Review the column mapping before confirming the import. Each ledger uses one currency.

```csv
date,description,category,amount,currency
2026-10-01,Flat rent,Housing,-1090.00,USD
2026-10-26,October salary,Income,2720.00,USD
```

Your ledger is processed and saved in your browser. Export a backup before clearing site data or moving to another device.

## Run locally

From the repository root, serve the static files with Python 3:

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). The app uses HTML, CSS, and JavaScript and runs without a build step.
