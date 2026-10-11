# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** the owner, planning an early retirement in Switzerland (Thurgau) around age 60, with a severance payment due, capital in the pension fund (BVG), two pillar 3a accounts and a life insurance policy (3b). Uses the app to decide how and when to draw each pillar.
- **Secondary:** a few people close to the owner (family, friends) with similar questions, invited by invite code. Each has their own account and data.
- Typical age 55+; the people deciding are often not finance professionals and read the numbers carefully, sometimes together with a partner.

## Product Purpose

Pension-Pal brings every part of a Swiss retirement provision into one place and lets the user calculate the decisions around it before making them:

- **All pillars in one place:** AHV, pension fund, 3a, 3b/life insurance, severance and free assets, filled from real documents (PDF import of pension certificates, policies, AHV statements) or entered by hand.
- **Payout decisions:** pension vs. lump sum vs. mixed, staggered 3a payouts, early retirement at 60–66 (AHV from 63 with reduction), capital withdrawal tax per canton.
- **Scenarios:** investment variants (pots with own share, return, volatility, costs; Monte Carlo with a safe withdrawal), use of the severance (pension-fund buy-in, savings, direct payout) and mortgage repayment from the pension fund.
- **Comparison with the median:** where the household stands against retirees in Switzerland (income, wealth by age).

Success: the user can see, for each option, how much money is available per month from retirement until the target age, what it costs in tax, where the invested capital comes from, and how far that is above or below the median — and trusts the numbers enough to act on them.

## Positioning

A personal planning tool that combines the user's own documents with official reference data (ESTV capital tax tables for all 26 cantons, BFS/LUSTAT medians, AHV 21 rules) and shows the whole retirement picture across all pillars at once, including early retirement and the severance — instead of a single-product calculator from one bank or insurer.

## Operating Context

- Used at a desk on a large screen, often over several sessions while documents arrive; mobile is secondary but must work.
- Inputs come from paper and PDF documents: pension-fund certificate (Vorsorgeausweis), AHV account statement (IK-Auszug), 3a statements, life insurance policies, the severance agreement.
- Two analysis views: "Auswertung & Analyse" (classic, inputs next to results) and "Cockpit (Planung)" (results as collapsible, reorderable cards; all inputs in a sidebar with tabs Szenario / Abfindung / Vorsorge / Anlage / Bedarf).
- Self-hosted at https://pensionpal.doebele12.de (Strato VPS); accounts by invite code, login by password or passkey.

## Capabilities and Constraints

- Swiss rules: AHV reference age 65 (women up to 1961: 64), early AHV draw from 63 at 6.8 %/year, 3a payouts from 60 (until 70 if still working), BVG Art. 79b 3-year lock after a buy-in, capital tax from the official ESTV calculator (tax year 2026, cantonal capitals, interpolated).
- Amounts in CHF with Swiss formatting (1'234.50); amounts in today's purchasing power unless marked nominal.
- Optional AI model (user's own key) for document extraction; API keys never go into CSV exports.
- Not financial or tax advice; every result is a model with stated assumptions and sources.
- Undecided: whether the Cockpit card layout is saved per profile on the server (today per browser).

## Brand Commitments

- Sister app of **Budget-Pal**, **Fintools** and **Application-Pal**: same rail navigation, token system, settings (theme, density, language), account and login patterns. Shared figures (e.g. Swiss medians) must match Budget-Pal.
- Language: German first (Swiss spelling, "ss" not "ß"), English second; UI chrome DE/EN, Knowledge articles German only.
- Dark mode by default, light mode equally supported; compact, data-dense presentation is preferred over generous whitespace.

## Evidence on Hand

- Official sources already cited in the app: ESTV tax calculator, BFS (SILC 2018, Berufliche Vorsorge 2024, Neurentenstatistik), LUSTAT FinSit 2024, AHV/IV leaflets 3.04 and 2.03, Fedlex (AHVG, BVG, BVV 3, DBG), BSV WiSiER.
- No testimonials, user counts or external endorsements exist; do not invent any.

## Product Principles

1. **One picture, all pillars.** Every number should be traceable to its source (document, profile field or official table) and its pillar.
2. **Decisions, not just data.** Show the options side by side (capital vs. pension, retire at 60 vs. 65, staggered vs. at once) with their monthly effect and tax.
3. **Honest models.** Assumptions, legal rules and limits are visible next to the result; missing values stay empty instead of being filled with examples.
4. **The user controls the view.** Results and inputs can be arranged to compare what matters to the user; the same calculation drives every view.

## Accessibility & Inclusion

- Users are 55+: sufficient font sizes and contrast are a requirement, not an option (target WCAG 2.1 AA), in both dark and light mode.
- Reorderable and collapsible areas must work by keyboard (handles reachable and operable without a mouse).
