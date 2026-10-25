---
date: '2026-11-01'
order: 1
title: 'Multi-Currency Payments Ledger'
github: 'https://github.com/SanicaVinayakMyana/payments-ledger'
external: 'https://github.com/sanicavinayakmyana'
demo: '/payments-ledger/'
tech:
  - Java 21
  - jOOQ
  - PostgreSQL
  - Redis
showInProjects: true
cover: './payments-ledger.png'
---

A payments ledger that models every money movement as double-entry journal entries, with row-level locking in PostgreSQL. It keeps zero balance drift across 10,000 concurrent transfers, uses Redis idempotency keys so client retries never double-charge, and sustains 800+ requests per second at under 50 ms p99 latency.
