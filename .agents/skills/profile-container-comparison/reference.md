# Profile report template

Write the report in Simplified Technical English.

- Write one instruction or fact in each sentence.
- Use the imperative, or use `must` / `Do not`.
- Do not use contractions.
- Do not use `should`, `please`, or an `-ing` form as the main verb.
- Use the same term for the same meaning.
- Keep each sentence to 25 words or less.

## File

Put a new investigation in `docs/<slug>.md`.
Put a follow-up on an issue in `docs/issues/<state>/<number>-<slug>/profile.md`.

## Template

```markdown
# Container comparison profile

## Conclusion

<State the slow path in one or two sentences.>

## Environment

- Revision: `<short sha>`
- Node.js: <version>
- Command: `node --experimental-strip-types .cursor/skills/profile-container-comparison/scripts/profile.ts run --scenario <name>`

## Timing

| Scenario | Iterations | ns/op |
| -------- | ---------: | ----: |
| <name>   |        <n> |   <n> |

These times come from the isolated loop.
They are not Vitest `hz` values.

## Samples

<Paste the bucket table and the library frame table from the script.>

## Cause

<Name the functions that own the tatenuki samples.>
<State how InferDI avoids that work, or state that the comparison is not the same API.>

## Next change

<Name one change, or state that no change is justified.>
```

## Script notes

`run` prepares the container first.
It then starts the V8 inspector profiler around the loop only.
It writes profiles and `INDEX.md` to `.cpu-profile/<revision>/`.

`summarize` reads one or more saved profiles.
Use `--format markdown` when you write the report.
Use `--format json` when you need the raw rows.

`--duration-ms` sets the target length of the profiled loop.
The default is 2500.
`--iterations` sets a fixed count and ignores `--duration-ms`.
