# Ambey Garments Ledger (PWA)

Minimal mobile-first ledger app using React + TypeScript + Vite with Firebase Firestore + Storage.

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Add your Firebase values in `.env`.

   Optional: configure admin bootstrap credentials using `VITE_ADMIN_PHONE` and `VITE_ADMIN_PASSWORD`.

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
        ├── users
        │     └── userId
        │            name
        │            phone
        │            password
        │            role (ADMIN | STAFF)
        │            approved
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

- App now supports phone + password login with signup and admin approval flow.
- PWA support includes `manifest.json` and `sw.js` registration.

## Admin login details

- Megha Jain is auto-seeded as the default admin user.
- Admin phone/password are read from `VITE_ADMIN_PHONE` and `VITE_ADMIN_PASSWORD`.
- Megha Jain should use **Login** directly (not Sign Up).
- New users must use **Sign Up** and wait for admin approval.
