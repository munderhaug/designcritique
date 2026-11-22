# Bank

## Platform

ios

## Stack

React PWA

## Users

Adults managing everyday money on their phone, sometimes under stress when a card goes missing. [confirmed]

## Product Purpose

See your money at a glance and act fast when something goes wrong with a card.

## Problem

People don't know what to do first when a card is lost or stolen, and they lose track of where their money goes. [confirmed]

## Key Tasks

1. **Stop a lost card** (must not fail): When my card goes missing, I want to freeze it at once, so nobody can use it.
2. **Check my balance**: When I'm about to spend, I want to see what I have, so I don't overspend.
3. **Review the month**: Once a month, I want to see where the money went, so I can adjust.

## Success Criteria

- Effectiveness: a first-time user freezes a lost card without help.
- Efficiency: freezing a card is two taps from the home screen.

## Journeys

1. **card-lost** (must not fail, during, leads to order-card): Card lost or stolen → Freeze card
2. **order-card** (after): Cards → Order new card → Confirm

## Concept model

| Object | Relates to | Actions |
|---|---|---|
| Customer | accounts, cards | sign in |
| Account | customer | open, view |
| Card | account | freeze, order |

## Scope

### MVP
- Lost card
- Accounts
- Cards
### v1
- Monthly summary
- Export
### Out of scope
- Crypto trading

## Feature map

| Feature | Problem part | Key task | Phase | Seen as |
|---|---|---|---|---|
| Lost card | Not knowing what to do first | Task 1 | MVP | Card lost, Card stolen, Card lost or stolen |
| Accounts | Not knowing what you have | Task 2 | MVP | Accounts |
| Cards | Managing cards | Task 1 | MVP | Debit card |
| Monthly summary | Losing track of spending | Task 3 | v1 | Monthly summary |
| Export | Keeping records | | v1 | Export statements |

## Navigation

1. Home
2. Accounts
3. Cards
