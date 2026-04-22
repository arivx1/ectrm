# De-hard-code Initiative

## Objective

Remove scattered runtime and business literals from application flow code.

This does **not** mean every string or number must become an environment
variable. The goal is to stop burying operational choices inside route handlers,
forms, and ad hoc fetch calls.

## Decision rules

Use the smallest appropriate home for a value:

1. Environment-specific runtime values
   - Put these in settings or env files.
   - Examples: database URL, CORS origins, API base URL, local bootstrap limits.

2. Shared application defaults
   - Put these in a single shared module, not inline in multiple files.
   - Examples: default list limits, commodity-class display order, trade option
     sets, event schema version.

3. Business vocabulary that operators may need to govern
   - Move these to reference/master data or a dedicated metadata endpoint.
   - Examples: books, commodities, price indices, counterparties, portfolios.

4. Demo and seed content
   - Keep this in explicit seed/fixture modules and scripts.
   - Do not leak seed values into normal runtime defaults.

5. Purely local presentation copy
   - Local component strings are acceptable when they are not reused and do not
     represent runtime policy or business logic.

## Applied in this pass

- Backend app version and allowed CORS origins now come from
  [`apps/api/app/config.py`](/Users/anthonyrivich/Documents/GitHub/ectrm/apps/api/app/config.py).
- Backend list pagination defaults now come from
  [`apps/api/app/core/query_params.py`](/Users/anthonyrivich/Documents/GitHub/ectrm/apps/api/app/core/query_params.py).
- Frontend API base resolution and bootstrap list limits now come from
  [`apps/web/src/shared/config.ts`](/Users/anthonyrivich/Documents/GitHub/ectrm/apps/web/src/shared/config.ts).
- Frontend trade-domain literals now live in
  [`apps/web/src/shared/trading.ts`](/Users/anthonyrivich/Documents/GitHub/ectrm/apps/web/src/shared/trading.ts).
- Trade capture no longer pre-fills sample price and volume values.

## Next targets

1. Expose server-owned trade metadata from the API so the web app stops mirroring
   backend enum values.
2. Replace repeated backend status strings such as `ACTIVE` and `CANCELLED`
   with shared enums/constants end to end.
3. Audit admin/demo services for seed-only values that are still mixed into
   normal runtime code paths.
4. Remove remaining duplicated query-string assembly in the web app by moving
   request construction behind typed API helpers.
