---
date: '2026-12-01'
order: 2
title: 'Real-Time Fraud Risk Scoring Service'
github: 'https://github.com/SanicaVinayakMyana/fraud-risk-service'
external: 'https://github.com/sanicavinayakmyana'
demo: '/fraud-risk-scoring/'
tech:
  - Java 21
  - Redis Streams
  - ONNX
  - PostgreSQL
showInProjects: true
cover: './fraud-risk-scoring.png'
---

A real-time service that scores payment events from the ledger in under <span class="count" data-to="15">15</span> ms p99. It combines Redis sliding-window velocity rules with an Isolation Forest model served in-JVM through ONNX Runtime, producing one explainable risk score with reason codes that cuts false positives by <span class="count" data-to="25">25</span>% compared to a rules-only baseline.
