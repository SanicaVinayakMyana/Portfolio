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

A payments ledger that models every money movement as double-entry journal entries, with row-level locking in PostgreSQL. It keeps zero balance drift across <span class="count" data-to="10000">10,000</span> concurrent transfers, uses Redis idempotency keys so client retries never double-charge, and sustains <span class="count" data-to="800">800</span>+ requests per second at under <span class="count" data-to="50">50</span> ms p99 latency.
