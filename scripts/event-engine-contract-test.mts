import assert from "node:assert/strict";
import { DEFAULT_EVENT_ENGINE_CONFIG } from "../lib/event-engine-config.ts";
import {
  EVENT_TAGS,
  EVENT_TYPES,
  actionIdentityKey,
  createEventChangeDraft,
  decideCandidate,
  decideEventMatch,
  hasStrongDuplicateEvidence,
  mergeSourceMessageIds,
  roleAppliesToUser,
  scoreEventMatch,
  type ConfidenceBreakdown,
  type ConflictEvidence,
  type EventMatchFactors,
  type UserRoleContext,
} from "../lib/event-engine.ts";

const factors = (overrides: Partial<EventMatchFactors> = {}): EventMatchFactors => ({
  topic_semantic: 0,
  key_entity_overlap: 0,
  existing_event_continuity: 0,
  publisher_consistency: 0,
  deadline_compatibility: 0,
  attachment_evidence: 0,
  temporal_proximity: 0,
  location_compatibility: 0,
  source_corroboration: 0,
  ...overrides,
});

const confidence = (overrides: Partial<ConfidenceBreakdown> = {}): ConfidenceBreakdown => ({
  normalization_confidence: 0.9,
  classification_confidence: 0.9,
  event_match_confidence: 0.9,
  role_confidence: 0.9,
  entity_confidence: 0.9,
  action_confidence: 0.9,
  deadline_confidence: 0.9,
  ...overrides,
});

const verifiedStudent: UserRoleContext = {
  user_id: "u1",
  identifiers: ["sisu20202502169872"],
  memberships: [{ role: "student", label: "2025级学生", verified: true }],
  memberships_complete: true,
};

const incompleteRoles: UserRoleContext = {
  user_id: "u1",
  identifiers: ["sisu20202502169872"],
  memberships: [{ role: "student", label: "2025级学生", verified: true }],
  memberships_complete: false,
};

const highMatchFactors = factors({
  topic_semantic: 0.95,
  key_entity_overlap: 0.9,
  existing_event_continuity: 0.9,
  publisher_consistency: 0.85,
  deadline_compatibility: 0.7,
  attachment_evidence: 0.6,
  temporal_proximity: 0.9,
  location_compatibility: 0.6,
  source_corroboration: 0.5,
});

// CASE 1: two unrelated notices -> two Events.
const firstEvent = decideEventMatch({ has_existing_candidate: false, match_score: 0, factors: factors() });
const unrelated = decideEventMatch({ has_existing_candidate: true, matched_event_id: "event-1", match_score: 0.22, factors: factors({ topic_semantic: 0.2, temporal_proximity: 0.5 }) });
assert.equal(firstEvent.decision, "create_new_event");
assert.equal(unrelated.decision, "create_new_event");

// CASE 2: two hardship-assessment supplements -> one Event, multiple Actions.
const supplementScore = scoreEventMatch({ factors: highMatchFactors, strong_anchor: false, explicit_update: false, hard_identity_conflict: false });
const supplementMatch = decideEventMatch({ has_existing_candidate: true, matched_event_id: "hardship-1", match_score: supplementScore, runner_up_gap: 0.4, factors: highMatchFactors });
assert.equal(supplementMatch.decision, "merge_existing_event");
const electronicAction = actionIdentityKey({ event_id: "hardship-1", action_type: "submit", actor_role: "specific_students", deadline: "2026-09-19", materials: ["申请表", "佐证材料"], submission_method: "电子版" });
const paperAction = actionIdentityKey({ event_id: "hardship-1", action_type: "submit", actor_role: "specific_students", deadline: "2026-09-22", materials: ["申请表", "佐证材料"], submission_method: "纸质版" });
assert.equal(new Set([electronicAction, paperAction]).size, 2);

// CASE 3: same notice from text and screenshot -> one Event, all sources retained.
assert.equal(hasStrongDuplicateEvidence({ canonical_text_match: false, attachment_fingerprint_match: true, official_reference_match: false, topic_similarity: 0.9, key_entity_overlap: 0.9 }), true);
assert.deepEqual(mergeSourceMessageIds(["message:text"], ["message:image"], ["message:text"]), ["message:text", "message:image"]);
const sameActionFromScreenshot = actionIdentityKey({ event_id: "hardship-1", action_type: "submit", actor_role: "specific_students", deadline: "2026-09-19", materials: ["佐证材料", "申请表"], submission_method: " 电子版 " });
assert.equal(sameActionFromScreenshot, electronicAction);

const currentEvidence = (value: unknown, source: string): ConflictEvidence => ({
  value,
  authority: "class_committee",
  explicit_update: false,
  verified_publisher_role: true,
  extraction_confidence: 0.95,
  corroboration: 0.5,
  recency: 0.2,
  source_message_ids: [source],
});
const updateEvidence = (value: unknown, source: string): ConflictEvidence => ({
  value,
  authority: "class_committee",
  explicit_update: true,
  verified_publisher_role: true,
  extraction_confidence: 0.95,
  corroboration: 0.6,
  recency: 1,
  source_message_ids: [source],
});

// CASE 4: deadline correction -> append EventChange, Friday -> Saturday.
const deadlineChange = createEventChangeDraft({ user_id: "u1", event_id: "hardship-1", action_id: "electronic-materials", field: "deadline", current: currentEvidence("2026-09-18", "message-a"), incoming: updateEvidence("2026-09-19", "message-b"), from_version: 1 });
assert.equal(deadlineChange?.resolution, "applied");
assert.equal(deadlineChange?.old_value, "2026-09-18");
assert.equal(deadlineChange?.new_value, "2026-09-19");
assert.equal(deadlineChange?.to_version, 2);

// CASE 5: review-group instruction, membership unknown -> no user candidate.
assert.equal(roleAppliesToUser({ role: "review_group", user_context: incompleteRoles }), null);
const unknownRoleDecision = decideCandidate({ has_action_cue: true, is_information_only: false, applies_to_user: null, event_match_decision: "merge_existing_event", unresolved_conflict: false, deadline_expected: false, confidence: confidence() });
assert.equal(unknownRoleDecision.decision, "NEEDS_REVIEW");

// CASE 6: explicit "all students submit" -> candidate Action.
assert.equal(roleAppliesToUser({ role: "all_students", user_context: verifiedStudent }), true);
const allStudentsDecision = decideCandidate({ has_action_cue: true, is_information_only: false, applies_to_user: true, event_match_decision: "create_new_event", unresolved_conflict: false, deadline_expected: true, confidence: confidence() });
assert.equal(allStudentsDecision.decision, "AUTO_CANDIDATE");

// CASE 7: role is clear but deadline confidence is low -> review.
const lowDeadlineDecision = decideCandidate({ has_action_cue: true, is_information_only: false, applies_to_user: true, event_match_decision: "create_new_event", unresolved_conflict: false, deadline_expected: true, confidence: confidence({ deadline_confidence: 0.5 }) });
assert.equal(lowDeadlineDecision.decision, "NEEDS_REVIEW");

// CASE 8: similar messages with an inconclusive best match -> review, never forced merge.
const ambiguousFactors = factors({ topic_semantic: 0.8, key_entity_overlap: 0.55, existing_event_continuity: 0.55, publisher_consistency: 0.7, deadline_compatibility: 0.4, temporal_proximity: 0.9 });
const ambiguousScore = scoreEventMatch({ factors: ambiguousFactors, strong_anchor: false, explicit_update: false, hard_identity_conflict: false });
const ambiguousMatch = decideEventMatch({ has_existing_candidate: true, matched_event_id: "candidate-a", match_score: ambiguousScore, runner_up_gap: 0.04, factors: ambiguousFactors });
assert.equal(ambiguousMatch.decision, "uncertain_needs_review");
assert.equal(decideCandidate({ has_action_cue: true, is_information_only: false, applies_to_user: true, event_match_decision: ambiguousMatch.decision, unresolved_conflict: false, deadline_expected: false, confidence: confidence() }).decision, "NEEDS_REVIEW");

// CASE 9: location correction -> old location -> new location.
const locationChange = createEventChangeDraft({ user_id: "u1", event_id: "meeting-1", field: "location", current: currentEvidence("A101", "message-c"), incoming: updateEvidence("B205", "message-d"), from_version: 3 });
assert.equal(locationChange?.resolution, "applied");
assert.equal(locationChange?.old_value, "A101");
assert.equal(locationChange?.new_value, "B205");
assert.equal(locationChange?.to_version, 4);

// CASE 10: a pure notice -> information only and no candidate Action.
const informationDecision = decideCandidate({ has_action_cue: false, is_information_only: true, applies_to_user: null, event_match_decision: "create_new_event", unresolved_conflict: false, deadline_expected: false, confidence: confidence({ action_confidence: 0.2, deadline_confidence: null }) });
assert.equal(informationDecision.decision, "INFORMATION_ONLY");

assert.equal(EVENT_TYPES.includes("scholarship" as never), false);
assert.equal(EVENT_TAGS.includes("scholarship"), true);
const weightTotal = Object.values(DEFAULT_EVENT_ENGINE_CONFIG.event_matching.weights).reduce((sum, weight) => sum + weight, 0);
assert.equal(Math.round(weightTotal * 100), 100);

console.log("Event Engine contract tests: PASS (10 fixtures)");
