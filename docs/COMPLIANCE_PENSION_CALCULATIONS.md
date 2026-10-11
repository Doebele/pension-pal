# Swiss Pension Compliance Calculations

This document describes the implemented calculation model and links to legal/official references.

## Implemented Endpoint

- `POST /api/calc/pension/comprehensive`

### Request Fields (core)

- `annual_gross_salary_chf`
- `retirement_age`, `reference_retirement_age`
- `ahv_annual_contributions_chf[]`, `ahv_rentenquote`
- `bvg_capital_at_retirement_chf`, `bvg_conversion_rate_percent`
- `pillar3a_contribution_chf`, `pillar3a_expected_return_percent`
- `private_products_annual_chf`
- `start_capital_chf`, `annual_spending_chf`
- `nominal_return_percent`, `inflation_rate_percent`
- `projection_years`

### Response Sections

- `ahv`
- `bvg`
- `pillar3a`
- `total_pension`
- `wealth_decay`
- `scenario_analysis`
- `meta.sources` (compliance/source links)

## Formula Mapping

### AHV

- Contribution factor: `0.75 * sum(contributions) / 3100`
- Age factor (60..65): min 80%, linearly to 100%
- Annual pension: `full_annual_pension * contribution_factor * age_factor * rentenquote`

### BVG / LPP

- Base annual pension: `capital_at_retirement * conversion_rate`
- Monthly pension: `annual / 12`
- Early retirement reduction with floor: `max(0.5, 1 - years_early * 0.06)`

### Pillar 3a

- Eligible contribution:
  `min(requested_contribution, tax_deduction_cap, gross_salary * 7%)`
- Annual tax-free return:
  `eligible_contribution * expected_return`

### Total Pension

- Annual total:
  `AHV_annual + BVG_annual + Pillar3a_drawdown + PrivateProducts_annual`

### Inflation / Wealth Decay

- Real capital:
  `capital / (1 + inflation)^years`
- Real return:
  `nominal_return - inflation`

## UI Mockup (Wireframe)

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Swiss Pension Compliance Calculator                                 │
├───────────────────────┬──────────────────────────────────────────────┤
│ Inputs                │ Results                                      │
│ - AHV contributions   │ AHV:      CHF xx'xxx.xx / year               │
│ - BVG capital/rate    │ BVG:      CHF xx'xxx.xx / year               │
│ - Pillar 3a           │ Pillar 3a: CHF x'xxx.xx / year               │
│ - Inflation, Return   │ Private:  CHF x'xxx.xx / year                │
│ - Projection years    │ -------------------------------------------- │
│                       │ Total:    CHF xx'xxx.xx / year               │
│                       │          CHF x'xxx.xx / month                │
├───────────────────────┴──────────────────────────────────────────────┤
│ Scenario Table                                                      │
│ baseline | early_retirement | late_retirement_bonus | low/high rate │
├───────────────────────────────────────────────────────────────────────┤
│ Sources: AHV, BVG, ESTV, SNB (clickable links)                      │
└───────────────────────────────────────────────────────────────────────┘
```

## Compliance Sources

- AHV legal text: https://www.fedlex.admin.ch/eli/cc/65/837_843_843/de
- BVG legal text: https://www.fedlex.admin.ch/eli/cc/1983/797_797_797/de
- ESTV tax information: https://www.estv.admin.ch/estv/de/home/direkte-bundessteuer/fachinformationen-dbst/steuerperiode.html
- Swiss National Bank: https://www.snb.ch

