# Trading UI Familiarity Reference

## Purpose

This note documents the major market-data terminals, execution workstations,
and ETRM/CTRM products that future ECTRM users may already know.

The goal is not to clone any one vendor product. The goal is to understand
which workflows feel familiar to different user populations so we can design
optional UI presets, saved workspaces, or navigation modes that reduce
training friction.

This landscape is current as of `2026-05-16`.

## Why This Matters

When users ask for a familiar trading UI, they are usually referring to one of
three different workflow families:

- market-data terminal users want dense multi-window monitoring, fast search,
  watchlists, news, charting, alerts, and keyboard-first navigation
- execution users want ladders, depth views, RFQ tickets, order blotters, and
  minimal-click trade entry
- ETRM/CTRM users want deal capture, position and exposure views, logistics,
  scheduling, settlement, accounting, and auditability

If we eventually let users choose a familiar UI, the right abstraction is
usually a workflow family first and a vendor-inspired preset second.

## Quick Reference By User Shorthand

When users say one of these names, they are often asking for the workflow
pattern more than the exact vendor screen:

- `Bloomberg`
  - usually means an information-dense market terminal with search, monitors,
    charts, alerts, and keyboard-driven navigation
- `Eikon`
  - usually means the LSEG Workspace style of research, watchlists, monitor
    pages, and quote-chain workflows
- `Trayport`
  - usually means OTC power and gas execution, broker-style market views, and
    RFQ or matching screens
- `TT` or `CQG`
  - usually means fast futures execution with ladders, DOM views, and minimal
    navigation depth
- `Endur` or `Openlink`
  - usually means an enterprise commodity ETRM with front-to-back trade,
    logistics, risk, and operations coverage
- `RightAngle`
  - usually means hydrocarbon-heavy logistics, scheduling, inventory, and
    downstream accounting workflows
- `Allegro`
  - usually means power, gas, or renewables position and risk management with
    operational follow-through
- `SAP`
  - usually means process-heavy, ERP-linked commodity operations with trading,
    hedging, reconciliation, and settlement tied closely to finance

## Major Market-Data Terminals

- [Bloomberg Terminal](https://www.bloomberg.com/professional/products/bloomberg-terminal/)
  - the default benchmark for information-dense cross-asset desktops
  - recognizable for keyboard-first navigation, multi-panel monitors, market
    data, news, chat, and function-driven workflows
- [LSEG Workspace](https://www.lseg.com/en/data-analytics/products/eikon-trading-software)
  - the current LSEG desktop that replaced Refinitiv Eikon
  - note: LSEG states Eikon was withdrawn from its product line on
    `2025-06-30`
  - familiar for monitor pages, quote chains, watchlists, news, analytics, and
    Excel-heavy workflows
- [ICE Connect](https://www.ice.com/market-data/desktop-solutions/ice-connect)
  and [WebICE](https://www.ice.com/market-data/desktop-solutions/trade)
  - especially relevant for energy, commodities, and fixed-income users
  - familiar for integrated market data, analytics, messaging, and exchange
    access inside a commodity-heavy desktop
- [FactSet Workstation](https://download.factset.com/documents/general/FactSet_Technology_Overview.pdf)
  - more common in investment, research, portfolio, and risk workflows than in
    physical commodities operations
  - still useful as a reference for multi-panel research, screening, portfolio,
    and analytics layouts

## Major Execution Workstations And Trading Screens

- [Trading Technologies TT Platform](https://tradingtechnologies.com/trading/tt-platform/)
  - major reference point for futures and options execution
  - recognizable for ladder or DOM trading, spread tools, fast order entry, and
    trader-centric workspace density
- [CQG Integrated Client](https://www.cqg.com/products/cqg-integrated-client)
  - another classic futures and commodities execution screen
  - familiar for chart-driven workflows, order routing, analytics, and depth
    views
- [CME Direct](https://www.cmegroup.com/solutions/market-access/cme-direct.html?redirect=%2Fdirect)
  - important for CME-centric futures and options users
  - recognizable for exchange-native blocks, spreads, ladders, and risk-aware
    trade entry
- [Trayport](https://trayport.com/products/)
  - one of the most important mental models in European OTC power and gas
  - recognizable for broker-style market views, RFQ and matching workflows, and
    energy-specific screen layouts
- [enmacc](https://enmacc.com/)
  - a newer but increasingly relevant OTC energy RFQ workflow, especially in
    Europe
  - recognizable for digital RFQ negotiation, quote comparison, and
    counterparty reach in power, gas, and environmental products
- [Fidessa](https://iongroup.com/fidessa/)
  - major institutional OMS and execution reference point
  - familiar for global order books, risk-aware routing, and multi-asset order
    management
- [FlexTRADER](https://flextrade.com/products/flextrader-execution-management-system/)
  - major buy-side EMS reference point
  - recognizable for blotters, algo routing, execution analytics, and highly
    configurable trading desktops
- [Tradeweb](https://www.tradeweb.com/)
  - major institutional fixed-income and rates execution venue
  - familiar for RFQ-driven liquidity access, dealer interactions, and
    ticket-centric fixed-income workflows
- [MarketAxess](https://investor.marketaxess.com/overview/default.aspx)
  - another major fixed-income execution reference
  - recognizable for credit trading workflows, axes, dealer interaction, and
    fixed-income liquidity views

## Major ETRM And CTRM Solutions

- [ION Openlink](https://iongroup.com/products/commodities/openlink/)
  - still commonly referred to in the market as Openlink or Endur, depending on
    desk context
  - major benchmark for large-enterprise front-to-back commodity trading, risk,
    logistics, and operations
- [ION RightAngle](https://iongroup.com/products/commodities/rightangle/)
  - especially familiar to crude, refined products, and NGL users
  - recognizable for logistics-heavy workflows, inventory, scheduling,
    operational visibility, and downstream accounting depth
- [ION Allegro](https://iongroup.com/products/allegro/)
  - especially relevant for power, gas, renewables, and utilities
  - recognizable for real-time position visibility, risk, compliance, and
    scheduling workflows
- [ION TriplePoint](https://iongroup.com/products/commodities/triplepoint/)
  - multi-commodity CTRM reference point for firms that need front-to-back
    coverage without the same operating model as the largest Endur-style shops
  - recognizable for trade capture, physical operations, and price risk
    management in one stack
- [SAP Commodity Management](https://www.sap.com/products/financial-management/commodity-management.html)
  - important whenever the customer is SAP-centric and process-heavy
  - recognizable for ERP-linked commodity procurement, sales, hedging, and
    reconciliation workflows
- [Brady ETRM](https://www.bradytechnologies.com/brady-etrm/)
  and [Brady CRisk](https://www.bradytechnologies.com/bradycrisk/)
  - especially relevant in European energy markets
  - recognizable for power and gas risk views, structured deal valuation, and
    credit exposure workflows
- [FIS Commodity Risk Manager](https://www.fisglobal.com/products/fis-commodity-risk-manager)
  - SaaS-style CTRM reference point for trade capture, valuation, accounting,
    and risk
  - recognizable for a more centralized risk, accounting, and reporting
    operating model
- [Molecule](https://molecule.io/)
  - a modern cloud-native ETRM reference point, especially in power and
    renewables
  - recognizable for API-first integration, cleaner UX, and near-real-time
    position, P&L, and risk reporting
- [Eka / Quoreka](https://eka1.com/trading-and-risk/)
  - cloud commodity-management reference point across energy and other
    commodities
  - recognizable for combining physical trade, derivatives, logistics, and risk
    on one platform

## Adjacent Institutional Platforms

These are not the first products to emulate for physical commodity operations,
but they matter if we expect crossover users from the buy side, treasury, or
institutional OMS world.

- [BlackRock Aladdin](https://www.blackrock.com/aladdin/)
  - recognizable for centralized risk-aware order and portfolio workflows
- [Charles River IMS](https://www.crd.com/)
  - recognizable for buy-side order management, compliance, allocations, and
    portfolio-linked trading workflows

## Practical UI Archetypes To Support

If ECTRM eventually supports user-selectable familiarity modes, these are the
best first archetypes to design for:

### 1. Market Terminal

Inspired by Bloomberg, Workspace, ICE Connect, and FactSet.

Key characteristics:

- dense multi-panel layout
- search-first navigation
- watchlists and monitors
- charts, news, alerts, and market context
- keyboard shortcuts and saved workspaces

### 2. Execution Workstation

Inspired by TT, CQG, CME Direct, Trayport, enmacc, Fidessa, and FlexTRADER.

Key characteristics:

- order blotter
- ladder, DOM, or RFQ ticket
- market depth or quote comparison
- working orders and fills
- very fast interaction with minimal navigation depth

### 3. Commodity ETRM Workbench

Inspired by Openlink, RightAngle, Allegro, TriplePoint, SAP Commodity
Management, Brady, FIS, Molecule, and Eka.

Key characteristics:

- trade capture and amendment flows
- positions, exposures, and P&L
- logistics and scheduling context
- settlement and accounting handoff
- exception management and auditability

### 4. Institutional OMS And Risk Console

Inspired by Aladdin, Charles River, Fidessa, FlexTRADER, Tradeweb, and
MarketAxess.

Key characteristics:

- portfolio-aware order workflow
- compliance and pre-trade checks
- allocations and post-trade lifecycle visibility
- execution analytics and routing controls

## Recommended Priority For ECTRM

For the current product direction, the most valuable presets are likely:

1. a Bloomberg or Workspace-like market terminal shell for information-dense
   monitoring
2. an ETRM-style workbench for trade capture, exposure, logistics, and
   scheduling
3. a Trayport or TT-like execution mode if we later push deeper into active
   trader workflows

That order covers the most common "make it feel familiar" requests without
trying to reproduce every niche screen in the market.

## Design Guardrails

- Emulate workflows, information density, object models, and interaction
  patterns. Do not copy logos, brand colors, proprietary icons, keyboard
  legends, or exact screen art.
- Keep one shared domain model underneath every preset. A user-facing mode
  should change navigation and layout, not the meaning of trades, positions,
  schedules, or approvals.
- Separate familiarity from authority. A familiar screen must still respect
  ECTRM audit trails, permission checks, and maker-checker boundaries.
- Start with saved workspace templates, layout presets, and keyboard schemes
  before building fully separate applications.
