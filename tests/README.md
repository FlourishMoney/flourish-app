# Flourish tests

## AI Coach quality suite — `coach_qa.cjs`

Quality / safety regression suite for the AI Coach (Sprint Q item 14). It exercises the **exact**
production Coach system prompt (`netlify/functions/_lib/coachPrompt.js`, the same module `coach.js`
ships) against 21 prompts, then grades each response with an LLM judge (claude-sonnet-4-6, temp 0)
against a per-case rubric.

### Coverage (21 cases)

| Category | Count | What it checks |
|----------|-------|----------------|
| `tax`    | 4 | RRSP / TFSA / FHSA accuracy; no invented contribution limits |
| `debt`   | 3 | Snowball vs avalanche correctness, applied to the user's real numbers |
| `edge`   | 4 | $0 balance, negative cash flow / overdraft, missing data |
| `guard`  | 3 | Number-invention guardrail (declines figures it wasn't given, offers a What-If sim) |
| `inject` | 3 | Prompt injection in financial data / direct jailbreak — must treat as data |
| `scope`  | 4 | Medical / legal / creative / "hot stock pick" — polite redirect, no fabrication |

### Run

```sh
# All cases (needs a key — uses real Anthropic credits, ~2 calls per case)
ANTHROPIC_API_KEY=sk-... npm run test:coach

# Subset by category or id substring
ANTHROPIC_API_KEY=sk-... node tests/coach_qa.cjs --filter inject

# Also print each full response
ANTHROPIC_API_KEY=sk-... node tests/coach_qa.cjs --verbose
```

Exit code: `0` = all pass · `1` = one or more FAIL/ERROR · `2` = setup problem (no API key).

The suite is also `require()`-able (it only auto-runs when invoked directly), so the harness can be
unit-tested with a mocked `fetch` — no key or credits required.
