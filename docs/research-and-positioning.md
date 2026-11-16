# Research agenda and product positioning

Status: working proposal for user research and product decisions. No user interviews, adoption results, or willingness-to-pay findings are claimed here.

Reviewed: 16 November 2026, against repository commit [f2bee27](https://github.com/Macaw-Labs/climate-lens/commit/f2bee274c7a6acce2c74dc5bee39a5ef8af79893). Implementation observations below describe that snapshot; hypotheses and proposed work are labeled separately.

## 1. Problem and value proposition

Municipal climate baselines combine estimates with different sources, methods, years, boundaries, and levels of supporting evidence. A total alone gives a team little help deciding which components can support a particular decision or which missing records to request next.

Climate Lens currently brings emissions, selected climate-risk indicators, provenance, and data-gap guidance together for Paraná's 399 municipalities. Its proposed value is to make that evidence understandable and actionable.

**Working value proposition:** Climate Lens helps municipal teams inspect their climate baseline, understand how its estimates were produced and supported, and identify the next local evidence to collect. Compatible local activity data can be recalculated deterministically; partial or incompatible estimates remain visible separately.

The central research hypothesis is that making these distinctions visible improves interpretation and leads to more feasible data-collection actions. That benefit has not yet been demonstrated with users.

### Proposed product boundaries

The initial focus is baseline interpretation and evidence improvement. Full inventory management, collaborative review, action prioritization, finance preparation, and monitoring are outside the current product scope.

The five-sector structure is a useful mapping for exploration; it does not establish that a record is a complete, independently verified GPC inventory. The Audit JSON export supports inspection and handoff, but does not constitute an independent audit.

## 2. Users and needs to validate

These are candidate user groups and needs, inferred from the workflow. Recruitment should establish whether they describe real responsibilities, constraints, and decisions.

| Candidate user | Situation and need | Current support | Research uncertainty |
| --- | --- | --- | --- |
| Municipal environment or climate staff | Prepare a baseline briefing and explain its limits | Municipal diagnostic, partial-total labels, sources, and provenance mix | Is explaining the baseline a recurring responsibility? What decision follows? |
| Municipal staff coordinating data requests | Identify a missing dataset, its likely custodian, and the required year and boundary | Sector and risk gap notes; local-input year and boundary fields | Are the suggested records obtainable, and who can authorize a request? |
| State agencies, municipal consortia, or technical-assistance teams | Screen municipalities for evidence gaps and target support | Regional explorer, filters, sorting, and municipality records | Is assistance allocated using these distinctions, or other criteria? |
| Researchers and inventory practitioners | Inspect assumptions and assess whether a local estimate is compatible | Schemas, factor registry, deterministic calculations, and Audit JSON | Are the records and export sufficient to reproduce and review an estimate? |
| Utilities, waste operators, and other data custodians | Understand what a municipality needs to supply | Gap guidance provides a starting point | Is the requested geography, period, unit, and evidence format clear enough? |

No shared review workspace, request assignment, or custodian response tracking is currently implemented.

## 3. Distinctive emphasis and alternatives

Climate Lens emphasizes the evidence behind the baseline:

- **Origin and verification are separate.** Local, modeled, and proxy describe how an estimate was produced. Verification status describes its supporting evidence. Neither is an IPCC methodological tier.
- **Missing components remain visible.** The record structure distinguishes unavailable values from genuine zeroes and identifies partial totals. Ingestion exceptions are documented in Section 8.
- **Gaps include collection guidance.** Notes point toward records such as electricity consumption, fuel sales, landfill tonnage, and local risk evidence. Their feasibility and specificity need user validation.
- **Partial contributions remain useful.** The calculator retains estimates with incompatible boundaries, years, or factor status separately from the baseline.
- **Regional access requires little setup.** Bundled records, browser-local changes, and a stateless API allow exploration without an application database.

The alternative may be an existing spreadsheet, a SEEG or AdaptaBrasil portal, a consultant's report, or a platform already used by the municipality. Research should compare against the participant's actual workflow.

[CityCatalyst](https://github.com/Open-Earth-Foundation/CityCatalyst) offers a broader inventory, risk, and planning platform. Its [documentation](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/develop/README.md) and [AdaptaBrasil API](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/develop/global-api/routes/legacy/city_adapta_risk.py) also show source, provenance, and missing-data concepts. Climate Lens should therefore present evidence interpretation and collection guidance as a focused emphasis, without claiming exclusive capabilities or superior scientific accuracy.

A possible future role is a public regional explorer that hands evidence to an inventory platform. That integration is a hypothesis; no CityCatalyst connector currently exists.

## 4. Priority research questions

| Priority / ID | Research question | Method and evidence | Finding that would weaken the proposition |
| --- | --- | --- | --- |
| P0 / RQ1 | Which recurring municipal decisions are blocked by uncertainty about the baseline? | Interviews about the last real briefing, inventory update, or data request; inspect redacted artifacts | Participants cannot identify a recurring decision or an accountable owner |
| P0 / RQ2 | Do users correctly distinguish missing from zero, local from verified, and partial from complete? | Task-based comprehension study with realistic municipal records and an expert scoring rubric | Labels repeatedly cause false confidence or users perform no better than with their current material |
| P0 / RQ3 | Does gap guidance produce a feasible next data request? | Ask users to specify custodian, dataset, year, geography, units, and purpose; review with a relevant custodian | Requests remain generic, target inaccessible data, or cannot be acted on |
| P1 / RQ4 | Do boundary and year checks prevent inappropriate baseline replacement while preserving useful contributions? | Test citywide, fleet-only, mismatched-year, and provisional-factor scenarios using controlled inputs | Users expect partial inputs to replace city totals, or cannot explain why an estimate remains separate |
| P1 / RQ5 | Can another practitioner reconstruct a recalculation from the export? | Give a reviewer the Audit JSON and documented source references; record missing information | The reviewer needs undocumented assumptions or cannot identify the baseline, factor, boundary, and changes |
| P1 / RQ6 | Does regional screening improve the allocation of technical assistance? | Ask assistance teams to explain a support shortlist, then compare with their established criteria | Rankings reward better data availability rather than actual need, or do not affect support decisions |
| P2 / RQ7 | Where should Climate Lens end and another tool take over? | Trace the next workflow step and test a sample handoff with practitioners | Existing platforms already meet the need with less friction, or the handoff adds duplicate entry |

RQ2 and RQ6 must test misleading interpretations as well as successful task completion. A provenance percentage is not an uncertainty interval, an accuracy score, or a measure of municipal performance.

## 5. Proposed first study

### Discovery

Recruit an initial purposive sample of approximately 10–12 participants: municipal staff from 4–6 municipalities with varied capacity and size, plus technical-assistance practitioners and relevant data custodians. This is a proposed qualitative sample, not a statistically representative survey.

Use Brazilian Portuguese for participant-facing sessions and test terminology such as origem dos dados, situação da verificação, estimativa parcial, and lacuna de dados. Preferred terminology remains an open research question.

Ask for recent examples rather than agreement with the product idea:

1. Describe the last climate baseline or risk briefing you prepared or used.
2. Which decision depended on it, and what information was missing?
3. How did you decide whether an estimate was suitable for that decision?
4. What data did you request, from whom, and what happened?
5. Which existing tool or document would Climate Lens need to improve upon?

Record constraints such as staff time, permissions, procurement, source access, and reporting obligations. Distinguish a usability problem from a lack of authority or access.

### Task-based evaluation

Use controlled research copies, not participants' operational records. Where possible, give each participant comparable tasks with their usual material and Climate Lens, alternating the order to reduce learning effects.

- Explain a municipal total with an unavailable electricity component and a genuine zero in another component.
- Interpret origin shares without converting them into confidence percentages.
- Identify the year of a risk indicator and assess its suitability for the stated decision.
- Evaluate whether a fleet-only estimate or a different-year activity record can replace a citywide baseline.
- Produce one concrete data request and explain the intended use of the result.
- Export a recalculation and ask a second practitioner to inspect it.

Set the expert answer rubric before sessions. Record task correctness, completion time, assistance required, uncertainty, and reasoning. Small-sample results guide iteration; they do not establish causal impact or scientific accuracy.

### Follow-through

With participants' agreement, follow up on one selected data request after 2–4 weeks. Record whether it was sent, answered, usable, reviewed, and compatible with the baseline. Identify the reason for each stalled step. These are proposed research activities, not automated requests or implemented product features.

## 6. Success measures and decision rules

| Outcome | Measure | Interpretation |
| --- | --- | --- |
| Correct interpretation | Correct distinctions across missing/zero, origin/verification, period, and coverage | Report each distinction separately; a combined score can hide a serious failure |
| Fewer inappropriate replacements | Count of attempted or accepted incompatible substitutions in study tasks | Correctly rejecting an input is insufficient if users misunderstand the reason |
| Actionable gap guidance | Requests meeting the predefined custodian, period, boundary, unit, and purpose rubric | A plausible request is an intermediate outcome, not evidence that data can be obtained |
| Useful evidence obtained | Requests yielding usable records, and reasons for failure | Separate source access from data quality and calculator compatibility |
| Reproducible handoff | Reviewer can identify inputs, factors, baseline, changes, and unresolved assumptions | An export alone does not demonstrate verification |
| Continued utility | Participants return for a real subsequent task and can describe its value | Page views and expressed enthusiasm are supporting signals only |

Establish numerical targets and stop/go criteria after discovery, before the task evaluation. Predefine critical errors, especially treating missing values as zero, presenting origin shares as accuracy, or treating partial estimates as citywide totals.

Continue toward a pilot when a recurring need, feasible evidence requests, and understandable outputs are demonstrated. Revise terminology and workflow when interpretation fails. Narrow or reconsider the product when data access is the dominant unresolved barrier or existing tools already serve the task adequately.

## 7. Evidence and interpretation rules

- Local origin alone does not establish accuracy or independent verification. Modeled or proxy origin alone does not establish poor quality.
- Provenance shares in the calculator are weighted by the absolute magnitude of available subsector emissions. They exclude unavailable values and are not statistical uncertainty estimates.
- A record can combine emissions, population, and risk indicators with different reference years. Display and assess each year separately; do not describe the bundle as a single contemporary observation.
- Risk indices from different indicators, vintages, or scenarios need methodological justification before comparison or aggregation. Selecting a highest displayed index does not establish a complete risk assessment.
- Reduced proxy share or increased reported emissions does not by itself show improved accuracy, reduced real-world emissions, or a successful intervention.
- A factor marked VERIFIED expresses the registry's recorded status. Independent source and methodological review is still required for substantive accuracy claims.
- Preserve source references and assumptions in research outputs. Obtain permission before collecting or sharing identifiable municipal documents or participant recordings.

## 8. Current limitations and work priorities

These are implementation observations and proposed priorities, not completed fixes.

| Priority | Observed limitation | Consequence and proposed work |
| --- | --- | --- |
| P0 | Ingestion converts nonnumeric/missing emissions cells to zero and defaults absent subsectors to zero | Distinguish genuine zero, absence, and invalid input; test incomplete and malformed source data |
| P0 | Missing population falls back to 1 | Represent unavailable population explicitly and suppress unsupported per-capita calculations |
| P0 | Raw-source tests require files that CI does not provision | Make source retrieval, versioning, checksums, and test inputs reproducible; distinguish schema checks from source reconciliation |
| P0 | Verification labels do not establish an evidence-review process | Define who may assign each status, what evidence is required, and how review is recorded; current source-reference checks are syntactic |
| P1 | The checked 2025 baseline has no matching registry factors marked VERIFIED for the supported local-input activities | Preserve year/factor checks; independently review relevant factors before promising merged improvements to that baseline |
| P1 | Several origin and methodology descriptions are assigned by subsector in the builder | Validate those descriptions against the actual source methodology and document exceptions |
| P1 | Gap notes and regional comparisons have not been validated with users | Test custodian relevance, attainability, comprehension, and inappropriate comparisons before expanding scope |
| P1 | Edits live in the browser and exports; no shared review history exists | Assess whether export-based handoff is sufficient before building collaboration and persistence |
| P1 | No repository license is specified | Select and add a license before presenting reuse terms as established |
| P2 | Integration with inventory platforms is proposed only | Validate demand and map identifiers, boundaries, periods, units, and evidence states before implementing a connector |

Reliability work and research can proceed together using clearly labeled study materials. A public promise of trustworthy evidence handling depends on closing the P0 gaps.

## 9. Implementation references

- [Project overview and setup](../README.md)
- [TypeScript municipal data contract](../data/schema/city.ts) and [Python schema](../data/schema/city_schema.py)
- [Ingestion and source mapping](../scripts/build_city_data.py)
- [Raw-data retrieval](../scripts/fetch_raw_data.py)
- [Deterministic calculation and merge rules](../src/lib/emissionsCalculator.ts)
- [Factor registry and recorded verification states](../src/lib/emissionFactors.ts)
- [Municipal diagnostic, browser persistence, and Audit JSON](../src/components/CityDiagnosticClient.tsx)
- [Regional explorer](../src/components/CitySelectorClient.tsx)
- [Maringá example record](../public/data/4115200.json)
- [CI configuration](../.github/workflows/ci.yml)

Update this document after research with dated findings, contradictory evidence, resulting decisions, and remaining questions. Keep observed behavior, participant evidence, and product proposals distinguishable.
