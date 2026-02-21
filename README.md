# Ambey Garments Ledger (PWA)

Minimal mobile-first ledger app using React + TypeScript + Vite with Firebase Firestore + Storage.

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Add your Firebase values in `.env`.

3. Install and run:

```bash
npm install
npm run dev
npm run build
```

## Firestore structure

```text
shops
  └── ambey-garments
        ├── customers
        │     └── customerId
        │            name
        │            currentBalance
        └── transactions
              └── transactionId
                     customerId
                     type (IN | OUT)
                     amount
                     note
                     date
                     billImageUrl
                     balanceAfter
```

Balance is atomically updated in a Firestore transaction every time a transaction is written.

## Deploy to Vercel

1. Push code to GitHub.
2. Import project in Vercel.
3. Set environment variables from `.env.example` in Vercel project settings.
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy.

## Notes

- Auth is intentionally skipped in phase 1.
- PWA support includes `manifest.json` and `sw.js` registration.
