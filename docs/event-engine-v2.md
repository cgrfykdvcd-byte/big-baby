# Event Engine V2.0 — frozen contract

Status: architecture and policy frozen; semantic stage implementations are intentionally pending.

## 1. Canonical data flow

```text
NormalizedMessage[]
  -> Classification
  -> Topic / Event Matching
  -> Role Resolution
  -> Entity Extraction
  -> Conflict / Update Detection
  -> Confidence / Review Decision
  -> Event
  -> Action[]
  -> Candidate Task
```

Only `NormalizedMessage[]` may enter the engine. Source adapters, OCR, file parsing, schedule parsing and WeCom handling end before this boundary. No engine stage may branch on a concrete source such as `image`, `file` or `wecom`.

| Stage | Input | Output | Sole responsibility | Safe failure | Confidence |
| --- | --- | --- | --- | --- | --- |
| Classification | messages | one primary `event_type`, zero or more tags | identify the broad domain | use `other`, mark degraded, continue to review | `classification_confidence` |
| Topic / Event Matching | messages, classification, existing Event snapshots | create / merge / uncertain plus scored factors | decide Event identity, not extract actions | never guess a merge; return uncertain | `event_match_confidence` |
| Role Resolution | messages, user role context | mentioned actors and whether each applies to the user | determine audience and membership | actor=`unknown`, applies=`null`; no user task | `role_confidence` |
| Entity Extraction | messages, classification, roles | deadlines, places, materials, methods, action drafts, information | extract values with evidence; do not choose an Event | retain text/evidence and mark missing fields | `entity_confidence`, `deadline_confidence`, `action_confidence` |
| Conflict / Update Detection | match, extracted entities, existing Event | no conflict / supported update / unresolved plus change drafts | compare new evidence with current values | never overwrite; emit pending review | conflict result confidence |
| Confidence / Review Decision | all preceding stage results | `AUTO_CANDIDATE`, `NEEDS_REVIEW` or `INFORMATION_ONLY` | apply centralized policy gates | default to `NEEDS_REVIEW` | minimum of required gates |
| Event assembly | preceding results and decision | Event | create or update the matter and attach all evidence | no partial silent write | Event confidence + breakdown |
| Action generation | Event, roles and extracted action drafts | Action[] | materialize distinct actor/action/deadline combinations | Event survives; no candidate task | Action confidence + breakdown |
| Candidate Task projection | Event and Action[] | candidate tasks | expose user-applicable Actions to the existing task system | return none | inherits Action decision |

Semantic uncertainty is a typed degraded/failed stage result. Infrastructure exceptions abort the engine write; `InboxItem` and `NormalizedMessage` remain untouched for retry/review.

## 2. Event

An Event is a durable matter, not a message and not a task. One Event may contain messages from many source types and may contain multiple Actions.

Required contract: `id`, `user_id`, `event_type`, `tags`, `title`, `summary`, `status`, `source_message_ids`, `participants`, `information`, `version`, `decision`, `confidence`, `confidence_breakdown`, `created_at`, `updated_at`.

`source_message_ids` is returned by aggregating `event_sources`. Every merge appends evidence; it never deletes an Inbox item, normalized message, attachment or prior source relation.

V2 Event statuses: `active`, `completed`, `cancelled`, `archived`, `needs_review`.

## 3. Action

An Action is one concrete requested step within an Event. Different actor, deadline, submission method or materially different deliverable means a separate Action.

Required contract: `id`, `user_id`, `event_id`, `action_type`, `title`, `actor`, `target_role`, `target_label`, `deadline`, `deadline_precision`, `location`, `materials`, `submission_method`, `status`, `source_message_ids`, `confidence`, `confidence_breakdown`, `requires_confirmation`, timestamps.

V2 action types: `submit`, `register`, `attend`, `prepare`, `pay`, `complete`, `confirm`, `review`, `contact`, `other`.

Information such as “review group members cannot withdraw after the publication period” remains Event information when it does not produce a confirmed user-applicable step. It must not be converted into a user Action merely because the user received the message.

All generated Actions begin as `proposed`. In V2, `requires_confirmation=true` means promotion or an external side effect requires confirmation. `AUTO_CANDIDATE` only permits creating a candidate task; it never submits materials, sends SMS/push, or writes/updates an external calendar.

## 4. Change and version history

V2 uses `Event.version` plus append-only `EventChange` deltas; a separate snapshot table is not required yet.

Each change stores: Event/action target, field, old value, new value, all source message ids, reason, confidence, resolution, `from_version`, optional `to_version`, and timestamp.

Supported frozen fields: `deadline`, `location`, `materials`, `submission_method`, `status`.

- Applied change: store old/new values, increment Event version once for the accepted update set, and set `to_version`.
- Pending review or rejected change: retain both values and evidence, do not mutate current state, and leave `to_version=null`.
- Several fields accepted from one update may share the same `from_version -> to_version` pair.

## 5. Classification taxonomy

Primary Event types are deliberately broad:

- `course`: class logistics, schedule or course-level notice not better represented below.
- `assignment`: homework, paper, project or course deliverable.
- `exam`: exam, quiz, assessment or exam arrangement.
- `administrative`: registration/records/selection/general administrative procedure.
- `financial_aid`: hardship assessment, grants and student funding.
- `activity`: campus activity, voluntary programme or competition.
- `meeting`: a meeting with a time/place as its core identity.
- `announcement`: information-only notice with no more specific domain.
- `other`: safe fallback.

V2 tags are `scholarship`, `competition`, `registration`, `material_submission`. Scholarship is a `financial_aid` Event tag; competition is an `activity` tag; registration and material submission describe workflow, not Event identity. Future tags use the `custom:` namespace. Taxonomy changes must be versioned rather than inferred from UI labels.

## 6. Event matching and clustering

String similarity is only part of `topic_semantic` and can never decide a merge alone. The configured default score is:

| Factor | Weight |
| --- | ---: |
| topic semantic similarity | 0.25 |
| key entity overlap (course, programme, form, organisation, reference id) | 0.20 |
| continuity with an existing Event | 0.15 |
| publisher consistency | 0.10 |
| deadline compatibility | 0.08 |
| attachment/document fingerprint evidence | 0.08 |
| temporal proximity | 0.06 |
| location compatibility | 0.04 |
| independent-source corroboration | 0.04 |

Rules:

- Exact canonical text digest, shared attachment digest, or a matching official reference plus strong topic/entity overlap is a strong duplicate anchor.
- A hard identity conflict (for example, different course code plus different assignment number, or mutually exclusive official reference ids) caps the score and prevents automatic merge.
- A changed deadline or location is not an identity conflict by itself. If the same Event is established, it proceeds to conflict/update detection.
- Different `source_type` values are weak corroboration only. Same source does not block a merge; different sources do not prove a merge.
- Existing Events for the same user are candidates. Compare the best and runner-up so a generic notice cannot attach to the wrong open Event.

Default outcomes:

- no plausible existing candidate: `create_new_event`;
- score `>= 0.82`, runner-up gap `>= 0.12`, and no hard identity conflict: `merge_existing_event`;
- score `<= 0.48` without a strong duplicate anchor: `create_new_event`;
- otherwise: `uncertain_needs_review`.

## 7. Cross-source deduplication

Normalize must expose generic provenance/evidence such as canonical text fingerprint, attachment fingerprint, document/reference id, publisher identity/authority and field confidence. The Event Engine consumes these generic fields and never asks how they were produced.

When strong duplicate evidence exists:

1. merge into one Event;
2. union all `source_message_ids` in `event_sources`;
3. deduplicate equivalent Actions by Event + action type + actor + deadline + materials + submission method;
4. attach the new message ids as additional Action evidence;
5. preserve every Inbox item, normalized message and attachment.

## 8. Role resolution

Frozen roles: `user`, `all_students`, `specific_students`, `class_committee`, `review_group`, `teacher`, `organization`, `unknown`.

Role applicability rules:

- Direct exact name/student-id/account match -> `user`, if evidence is unambiguous.
- `all_students` applies only when the user has verified student membership.
- `specific_students` applies only when the eligibility list/condition can be matched to the user.
- `class_committee`, `review_group`, `teacher`, or `organization` applies only with verified stored membership or an explicit exact identity match.
- Receiving or forwarding a message is never membership evidence.
- Missing/incomplete user role context produces `applies_to_user=null`, not `true`.
- A complete role profile that proves non-membership may produce `false`.

An uncertain/unknown role cannot create a user candidate task. A concrete role-specific instruction may be retained as Event information or a proposed Action awaiting role confirmation.

## 9. Confidence and thresholds

Persist one summary confidence for sorting and the following bounded `[0,1]` breakdown for explanation and policy:

- `normalization_confidence` (includes generic OCR/parser quality supplied by Normalize);
- `classification_confidence`;
- `event_match_confidence`;
- `role_confidence`;
- `entity_confidence`;
- `action_confidence`;
- `deadline_confidence` (nullable when no deadline is expected).

Do not average away weak safety-critical evidence. Review decisions use the minimum required gate. Event confidence may summarize for display but never replaces the breakdown.

Default levels: high `>=0.85`, medium `0.60–0.849`, low `<0.60`. Existing normalized `high/medium/low` map to `0.90/0.70/0.40`.

Default AUTO gates: normalization `0.65`, classification `0.75`, event match `0.82`, role `0.85`, entity `0.75`, action `0.85`, and deadline `0.80` when a deadline is expected.

All values, match weights, authority scores and margins live in `event-engine-config.ts` and are injected into the service. Stage code and routes must not duplicate numeric thresholds.

## 10. Review decision

`AUTO_CANDIDATE` requires all of the following: explicit actionable meaning, proven applicability to the user, create/merge decision not uncertain, no unresolved conflict, every required confidence gate passed, and adequate deadline confidence when the text implies a deadline. It creates only a candidate task.

`NEEDS_REVIEW` applies to an unknown role, uncertain Event match, unresolved conflict, low required confidence, low/ambiguous deadline confidence, optional participation needing user choice, or an upstream semantic-stage failure. It may persist a review Event/proposed Action but projects no candidate task before confirmation.

`INFORMATION_ONLY` applies when there is no user action, the instruction is proven to target another role, or the content is purely informative. It creates an Event with no Action/candidate task. If actionable wording exists but interpretation failed, use `NEEDS_REVIEW`, not `INFORMATION_ONLY`.

## 11. Conflict priority

Conflict handling starts only after same-Event identity is established. Evidence priority is configured from:

- publisher authority: 35%;
- explicit “correction/change/update/cancel” wording: 25%;
- verified publisher role: 15%;
- extraction confidence: 15%;
- independent corroboration: 5%;
- recency: 5%.

Recency is deliberately weak and can never make “latest wins” the rule. Default authority order is official, verified staff, organization, class committee, peer, unknown. An explicit update may auto-apply only when its authority is not materially below the current evidence, its extraction confidence is `>=0.80`, and its priority lead is `>=0.12`. Without update wording, automatic replacement requires a material authority advantage (`>=0.35`). Otherwise create a pending EventChange and require review.

## 12. Traceability and client boundary

Every Event reaches messages through `event_sources`; every Action and EventChange stores its supporting message ids. Each NormalizedMessage reaches its Inbox item by `source_id`/`inbox_item_id`, and the Inbox item retains original text and attachment metadata. Generated titles and summaries are never accepted as evidence.

The engine and persistence live in the backend business layer. Web, iOS and Android consume the same API and types. React pages must not classify, merge, resolve roles, apply thresholds or resolve conflicts.

## 13. Critical prerequisite

Current normalized message ids are derived from chunk position (`InboxItem id + index`) and storage uses replace semantics. Before Event writes are enabled, Terra must make normalized evidence ids immutable/versioned and prevent a re-normalization from silently replacing or leaving stale evidence. Until then the new tables/contracts may be deployed, but the compatibility candidate projector remains the active path.

## 14. Terra implementation checklist

1. Stabilize immutable/versioned NormalizedMessage evidence ids; add a regression test for re-normalization with changed chunk counts.
2. Implement classification returning one primary Event type, tags, evidence ids and confidence.
3. Implement fingerprint extraction and Event candidate retrieval for the same user.
4. Implement weighted Event matching, runner-up comparison and create/merge/uncertain outcomes exactly from config.
5. Implement role resolution against verified user role context; never infer membership from message receipt.
6. Implement entity extraction with per-value evidence and deadline confidence; separate information from action drafts.
7. Implement duplicate Action fingerprints and union source evidence across text/image/file/schedule/WeCom-normalized messages.
8. Implement conflict detection and append-only EventChange recording; apply accepted update sets transactionally with one Event version increment.
9. Implement centralized review decision and candidate-task projection; keep every external side effect behind later confirmation.
10. Add repository/service persistence for Events, event sources, Actions and changes; scope every query by `user_id`.
11. Add backend API endpoints used identically by Web and future mobile clients; do not place rules in React.
12. Run the ten frozen fixtures, database integration tests, TypeScript, production build and lint before replacing the compatibility projector.
