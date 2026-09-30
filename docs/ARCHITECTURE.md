# QuickQuery Architecture Audit

**Audit scope:** repository state on branch `v0/quickquery-dashboard` before introducing a real data engine.

## Executive summary

QuickQuery is currently a single-route Next.js 16 client-rendered MVP. It provides a polished landing page and an in-browser workspace visual prototype, but it does not yet ingest CSV files or execute queries. Dataset rows, fields, query results, and chart data are hardcoded module constants; the natural-language interaction selects one of three hardcoded result sets using keyword matching and an artificial timeout.

The current UI and interaction vocabulary should be preserved. The next implementation should replace the mock data boundary—not the visual system—with a browser-local pipeline based on CSV parsing, schema detection, validated structured queries, and DuckDB-WASM.

## Repository inventory

The repository is intentionally small:

- `app/page.tsx`: the complete client UI, mock dataset, state, query simulation, table/chart rendering, and landing page.
- `app/globals.css`: the complete visual system, responsive rules, light/dark tokens, typography imports, and focus styles.
- `app/layout.tsx`: root metadata and global stylesheet loading.
- `next.config.ts`: baseline response security headers.
- `package.json` / `package-lock.json`: Next.js, React, Recharts, Lucide, Tailwind/PostCSS, TypeScript, and utility dependencies.
- `tsconfig.json`: strict TypeScript with bundler resolution and `@/*` alias.
- No `components/`, `lib/`, `public/`, test directory, API routes, server actions, database schema, or documented data layer currently exists.

## Current architecture

The app uses the Next.js App Router with one route (`/`). `app/page.tsx` is marked `'use client'`, so the entire experience—including the landing page and workspace—is hydrated in the browser. There is no server data fetching and no persistence layer.

The layout is:

1. `RootLayout` applies global CSS and static metadata.
2. `Home` owns all application state and conditionally renders either `Landing` or the workspace.
3. The workspace contains a top bar, responsive dataset sidebar, natural-language prompt, visual-query controls, result toolbar, chart/table view, and footer status.
4. Recharts renders either a vertical bar chart or line chart from the current `result.data`.

The visual system is custom CSS rather than a component library. It uses Manrope and DM Mono, semantic CSS variables, responsive breakpoints at 800px and 460px, and light/dark token sets.

## What is implemented

Implemented and should be preserved:

- Landing page with product messaging, workflow steps, sample dataset framing, CTA controls, and dark-mode toggle.
- Workspace shell with responsive sidebar/mobile navigation.
- Dataset and field presentation using a fixed Northstar Retail sample.
- Natural-language prompt input with click and Enter submission.
- IME-safe Enter handling (`isComposing` and Safari key code 229 guard).
- Three demo query outcomes: top products, revenue by region, and revenue over time.
- Loading state with simulated 800ms analysis delay.
- Chart/table view toggle.
- Recharts bar and line visualizations with tooltips and totals.
- Result table, filter panel toggle, field selection state, theme state, and basic focus-visible styles.
- Baseline headers: `X-Content-Type-Options`, `Referrer-Policy`, and `Strict-Transport-Security`.
- Strict TypeScript compilation and a successful production build.

## What is mocked or incomplete

The following are presentation-only today:

- The CSV upload buttons call `onStart`; they do not open a file picker or read a file.
- `Northstar Retail`, row counts, column counts, field names, and all sample values are constants.
- Query interpretation is `toLowerCase()` plus substring checks for `region`, `time`, and `month`.
- Query execution is a `setTimeout`, not computation over rows.
- Visual query controls are buttons without selection menus or execution behavior.
- The Add filter button has no handler.
- Filter controls display fixed labels and do not change the result.
- Export displays an alert; no CSV, PNG, or PDF is produced.
- Share, dataset switcher, more-options, and edit-query controls have no behavior.
- The result footer always reports `0.8s` regardless of actual work.
- No upload validation, parser errors, schema warnings, query errors, cancellation, or empty-result states exist.

## State and data contracts today

All state lives in `Home` React state and is lost on refresh or navigation. There is no `localStorage`, `sessionStorage`, URL state, server state, or database state.

Current state includes:

- `started`: landing/workspace transition.
- `dark`: theme token selection.
- `query`: prompt text.
- `loading`: simulated query lifecycle.
- `view`: `'chart' | 'table'`.
- `result`: `{ title, meta, data, kind }` where each data row is `{ name, value }`.
- `field`: selected sidebar field name or `null`.
- `mobileNav`: responsive sidebar visibility.
- `filterOpen`: filter panel visibility.

The current result contract is intentionally narrow and display-shaped. It is not a general dataset contract: it loses original columns, types, source row identity, grouping metadata, filters, and query provenance. The real engine should introduce domain types separate from chart/table view models.

## Proposed V1 data-engine architecture

```text
File input
  -> CSV parser
  -> normalized rows + schema detection
  -> DuckDB-WASM registration/import
  -> validated structured query
  -> DuckDB execution
  -> typed result dataset
  -> chart/table adapters
```

Recommended modules:

- `lib/data/types.ts`: dataset, column, scalar, filter, query, execution result, and diagnostic types.
- `lib/csv/parse.ts`: file-size/type checks, parsing, header normalization, row normalization, and parser diagnostics.
- `lib/schema/detect.ts`: infer text, numeric, boolean, and date/time columns with confidence and representative samples.
- `lib/query/types.ts`: provider-independent structured query AST, for example measure, aggregation, group-by, date range, filters, sort, and limit.
- `lib/query/validate.ts`: allowlist fields and operations against the detected schema; reject unknown columns, invalid combinations, unsafe limits, and malformed values.
- `lib/engine/duckdb.ts`: the only DuckDB-WASM integration point; owns database lifecycle, table registration, query execution, and cleanup.
- `lib/query/compile.ts`: compile the validated AST to parameterized or safely quoted DuckDB SQL. The compiler, not the AI, owns SQL generation.
- `lib/results/adapters.ts`: map engine results to chart/table view models without changing the UI contract unnecessarily.

Keep these modules independent of React so they can be unit-tested and eventually reused by workers or a future connector adapter.

## Query lifecycle

1. User selects a local CSV.
2. The browser validates file type and size before parsing.
3. The parser returns normalized records and parse diagnostics.
4. Schema detection assigns column types and confidence; ambiguous columns remain explicitly marked.
5. The dataset store registers the data with DuckDB-WASM under an application-generated table name.
6. A visual query builder creates a structured query object.
7. Any future natural-language provider returns the same structured query object, never executable SQL.
8. The validator checks fields, operators, aggregation compatibility, date ranges, limits, and resource bounds against the detected schema.
9. The compiler generates a constrained DuckDB query using safe identifier quoting and validated values.
10. DuckDB executes locally and returns typed rows plus execution metadata.
11. Result adapters feed chart/table components.
12. The UI exposes errors, warnings, row counts, and execution duration without treating them as successful results.

Cancellation should be supported at the engine boundary so a new query can supersede an older one. Loading state should represent the actual lifecycle rather than a fixed delay.

## Security boundaries

The browser-first model reduces server-side data exposure, but it does not make arbitrary query execution safe. The key boundary is:

```text
Natural language or controls
  -> structured query schema
  -> schema-aware validator
  -> constrained compiler
  -> DuckDB-WASM
```

AI output must be treated as untrusted data. It must be parsed as structured output, validated against the current schema, bounded by explicit limits, and rejected on any unknown field or unsupported operation. Do not accept model-generated SQL as an execution primitive. Do not expose a general-purpose SQL textarea in the V1 product.

Additional controls:

- Enforce maximum file size, row count, column count, query result size, and execution time where practical.
- Sanitize or safely quote identifiers derived from CSV headers.
- Avoid rendering cell values as HTML.
- Keep provider credentials out of the browser; a future AI provider call should use a server boundary or a trusted provider integration.
- Do not upload CSV contents to an AI provider unless the product explicitly adds that behavior and explains it to the user.
- Preserve the existing response headers and consider adding `Permissions-Policy` and a report-only CSP after validating required origins.

## State management

For V1, use a small client-side store or composed React context for the active dataset, schema, query, execution state, and result. Keep transient UI state—theme, open panels, selected view—near the relevant UI. Do not persist raw CSV data by default.

Suggested state slices:

- `dataset`: file metadata, normalized rows/engine table reference, schema, diagnostics.
- `query`: structured query, validation errors, query source (`visual` or `natural-language`).
- `execution`: status, request id, start/end timestamps, cancellation, error.
- `result`: typed columns, rows, summary metadata, chart recommendation.
- `ui`: view mode, selected field, filters panel, mobile navigation, theme.

A request id or abort signal is needed to prevent stale DuckDB results from replacing a newer query result.

## DuckDB-WASM integration point

DuckDB-WASM belongs behind `lib/engine/duckdb.ts`, not in `app/page.tsx` or chart components. The integration should provide a narrow interface such as:

- initialize once per browser session;
- register or replace the active dataset;
- execute a validated query request;
- return typed columns, rows, and execution metadata;
- cancel/close resources when a dataset is replaced or the page is disposed.

The first implementation can use an in-memory DuckDB table created from parsed CSV data. Keep the table name internal and generated, and keep DuckDB-specific SQL/types out of the UI. A Web Worker should be considered if parsing or queries make the main thread noticeably unresponsive.

## AI integration boundary

Natural-language support should be added after the deterministic visual query path works. The AI boundary accepts a question plus a compact schema description and returns only a structured query object. It should not receive unrestricted execution tools or database credentials.

The provider adapter should be replaceable and should expose provider-neutral errors. The server-side route or action, if needed, should validate the structured response again on the client against the active schema before execution. AI is an optional interpretation layer; DuckDB and the validator remain authoritative.

## Chart and table consumption

Charts currently consume display-shaped `{ name, value }` arrays and select a chart type from `result.kind`. Preserve that UI behavior through a result adapter, but make the adapter derive those values from typed engine results. The engine result should retain columns, raw rows, numeric formatting metadata, and query provenance so tables and future charts can evolve without rerunning the query.

Chart components should receive a stable, serializable view model. They should not know about CSV parsing, DuckDB, SQL, or AI providers.

## Filters

Today filters are only a visibility toggle with fixed labels. In V1, represent filters as typed query predicates, for example:

```ts
type Filter = {
  column: string
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
  value: string | number | boolean | null
}
```

The UI should build filters from detected column types and allowed operators. Validation must reject incompatible values and unknown columns before compilation. Filters should be part of the same structured query used by both the visual builder and future natural-language interpretation.

## Future database connector boundary

Do not add connectors in V1. The browser-local engine is the default execution target. If connectors are added later, introduce a `QueryEngine` interface with capability discovery rather than coupling the UI to DuckDB:

```text
Dataset source -> source adapter -> schema/query capability contract -> QueryEngine -> result adapter
```

A connector must enforce its own authorization, tenant isolation, parameterization, pagination, and resource limits. The same validated query AST should be the input contract where possible. Connector-specific SQL or APIs must remain behind the engine adapter.

## Testing strategy

Current automated coverage: no test files or test script are present. `npm run build` passes. `npm run lint` cannot run because the manifest defines the script but `eslint` is not installed or declared as a dependency.

Recommended sequence:

1. Unit tests for CSV parsing, normalization, schema inference, date/number coercion, and diagnostics.
2. Unit tests for query validation, operator compatibility, limits, identifier handling, and rejection cases.
3. Engine tests against representative datasets covering aggregation, grouping, filters, sorting, empty results, and malformed input.
4. Result-adapter tests for chart and table view models.
5. Component tests for upload states, query submission, loading/error/empty states, filter editing, view switching, and export.
6. Browser smoke tests for the landing-to-workspace flow, local CSV upload, visual query execution, and responsive navigation.
7. Security regression tests ensuring arbitrary SQL and unknown schema fields never reach the engine.

Add the smallest appropriate test runner before implementing engine behavior; do not add infrastructure services for this browser-local product.

## Known risks

- Large CSVs can block the main thread during parsing or DuckDB initialization.
- Browser memory limits may be reached by very large files or duplicated row representations.
- Date and numeric inference is ambiguous for locale-formatted values.
- DuckDB-WASM worker and WASM asset loading must work under Vercel deployment headers and preview routing.
- CSV headers may contain duplicates, reserved words, or unusual Unicode characters.
- Result types may include nulls and mixed values that current chart formatters do not handle.
- A future AI provider can produce invalid or semantically wrong query plans even when structurally valid.
- Exporting charts or tables requires a real download path and may have browser-specific limitations.
- Current accessibility is a useful baseline but interactive buttons without handlers, unlabeled controls, and chart-only information need review as functionality becomes real.

## Recommended implementation sequence

1. Extract domain types and result adapters without changing the visual design.
2. Implement CSV upload, file validation, parsing, schema detection, and explicit diagnostics.
3. Add an in-memory dataset store and replace hardcoded dataset metadata in the sidebar.
4. Add DuckDB-WASM behind the engine interface and execute a deterministic visual query.
5. Replace fixed visual-query controls with typed controls backed by the query AST.
6. Implement filters, sorting, limits, empty/error states, cancellation, and real execution metadata.
7. Implement CSV export and chart/table export as separate, testable adapters.
8. Add browser tests and performance checks for realistic file sizes.
9. Add the optional AI structured-query adapter only after validator and engine tests are stable.
10. Evaluate worker isolation and future connector adapters based on measured bottlenecks, not assumptions.

## Audit findings and decisions

- Preserve the existing CSS, visual hierarchy, interaction vocabulary, and chart/table surface.
- Replace mock constants and keyword matching at the data boundary, not by redesigning the page.
- Keep data local and browser-first; no authentication, billing, external database, Redis, Docker, or connector work is justified for V1.
- Treat validated structured queries as the stable contract between UI, AI, and execution.
- Keep DuckDB-WASM and any future providers behind modular interfaces so the frontend remains provider-independent.
- This audit intentionally changes documentation only; production application code remains unchanged.

## Validation record

- `npm run build`: passed with Next.js 16.3.8; route `/` statically prerendered.
- `npm run lint`: not executed successfully; `eslint` is not installed (`sh: eslint: command not found`).
- Repository inspection found no existing test files or test script.
- No production code was modified during this audit.

*Generated as an engineering baseline for the next QuickQuery implementation phase.*
