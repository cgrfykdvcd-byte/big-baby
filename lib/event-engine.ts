import type { NormalizedMessage } from "./inbox";
import {
  DEFAULT_EVENT_ENGINE_CONFIG,
  type EventEngineConfig,
  type EventMatchFactorName,
} from "./event-engine-config.ts";

export const EVENT_TYPES = [
  "course",
  "assignment",
  "exam",
  "administrative",
  "financial_aid",
  "activity",
  "meeting",
  "announcement",
  "other",
] as const;

export const EVENT_TAGS = [
  "scholarship",
  "competition",
  "registration",
  "material_submission",
] as const;

export const PARTICIPANT_ROLES = [
  "user",
  "all_students",
  "specific_students",
  "class_committee",
  "review_group",
  "teacher",
  "organization",
  "unknown",
] as const;

export const ACTION_TYPES = [
  "submit",
  "register",
  "attend",
  "prepare",
  "pay",
  "complete",
  "confirm",
  "review",
  "contact",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type BuiltInEventTag = (typeof EVENT_TAGS)[number];
export type EventTag = BuiltInEventTag | `custom:${string}`;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
export type ActionType = (typeof ACTION_TYPES)[number];
export type EventStatus = "active" | "completed" | "cancelled" | "archived" | "needs_review";
export type ActionStatus = "proposed" | "confirmed" | "in_progress" | "completed" | "cancelled" | "dismissed";
export type ReviewDecision = "AUTO_CANDIDATE" | "NEEDS_REVIEW" | "INFORMATION_ONLY";
export type EventMatchDecision = "create_new_event" | "merge_existing_event" | "uncertain_needs_review";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ConfidenceScore = number;

export type ConfidenceBreakdown = {
  normalization_confidence: ConfidenceScore | null;
  classification_confidence: ConfidenceScore | null;
  event_match_confidence: ConfidenceScore | null;
  role_confidence: ConfidenceScore | null;
  entity_confidence: ConfidenceScore | null;
  action_confidence: ConfidenceScore | null;
  deadline_confidence: ConfidenceScore | null;
};

export type EventParticipant = {
  role: ParticipantRole;
  label: string;
  applies_to_user: boolean | null;
  confidence: ConfidenceScore;
  source_message_ids: string[];
};

export type EventInformation = {
  text: string;
  confidence: ConfidenceScore;
  source_message_ids: string[];
};

// Event is the durable "matter". It is neither an input message nor a task.
export type Event = {
  id: string;
  user_id: string;
  event_type: EventType;
  tags: EventTag[];
  title: string;
  summary: string;
  status: EventStatus;
  source_message_ids: string[];
  participants: EventParticipant[];
  information: EventInformation[];
  version: number;
  decision: ReviewDecision;
  confidence: ConfidenceScore;
  confidence_breakdown: ConfidenceBreakdown;
  created_at: string;
  updated_at: string;
};

export type RoleBinding = {
  role: ParticipantRole;
  label: string;
  applies_to_user: boolean | null;
  confidence: ConfidenceScore;
  source_message_ids: string[];
};

export type Action = {
  id: string;
  user_id: string;
  event_id: string;
  action_type: ActionType;
  title: string;
  actor: RoleBinding;
  target_role: ParticipantRole;
  target_label: string;
  deadline: string | null;
  deadline_precision: "date" | "datetime" | "range" | "unknown";
  location: string | null;
  materials: string[];
  submission_method: string | null;
  status: ActionStatus;
  source_message_ids: string[];
  confidence: ConfidenceScore;
  confidence_breakdown: ConfidenceBreakdown;
  requires_confirmation: boolean;
  created_at: string;
  updated_at: string;
};

export const CHANGE_FIELDS = ["deadline", "location", "materials", "submission_method", "status"] as const;
export type EventChangeField = (typeof CHANGE_FIELDS)[number];
export type EventChangeResolution = "applied" | "pending_review" | "rejected";

// Event.version plus append-only EventChange deltas is the V2 version model.
// A pending/rejected change has no to_version and never mutates current state.
export type EventChange = {
  id: string;
  user_id: string;
  event_id: string;
  action_id: string | null;
  field: EventChangeField;
  old_value: unknown;
  new_value: unknown;
  source_message_ids: string[];
  reason: string;
  confidence: ConfidenceScore;
  resolution: EventChangeResolution;
  from_version: number;
  to_version: number | null;
  created_at: string;
};

export type CandidateTask = {
  id: string;
  user_id: string;
  event_id: string;
  action_id: string;
  title: string;
  deadline: string | null;
  location: string | null;
  status: "candidate";
  source_message_ids: string[];
  requires_confirmation: true;
};

export type EngineIssue = {
  code: string;
  message: string;
  source_message_ids: string[];
};

export type StageResult<T> = {
  outcome: "ok" | "degraded" | "failed";
  value: T;
  confidence: ConfidenceScore;
  issues: EngineIssue[];
};

export type ClassificationResult = {
  event_type: EventType;
  tags: EventTag[];
  evidence_message_ids: string[];
};

export type EventMatchFactors = Record<EventMatchFactorName, ConfidenceScore>;

export type EventMatchResult = {
  decision: EventMatchDecision;
  matched_event_id: string | null;
  match_score: ConfidenceScore;
  decision_confidence: ConfidenceScore;
  runner_up_gap: ConfidenceScore;
  factors: EventMatchFactors;
  strong_duplicate: boolean;
  hard_identity_conflict: boolean;
};

export type RoleResolutionResult = {
  actors: RoleBinding[];
};

export type ExtractedValue<T> = {
  value: T;
  confidence: ConfidenceScore;
  source_message_ids: string[];
};

export type ActionDraft = Omit<Action, "id" | "event_id" | "created_at" | "updated_at">;

export type EntityExtractionResult = {
  deadlines: ExtractedValue<string>[];
  locations: ExtractedValue<string>[];
  materials: ExtractedValue<string[]>[];
  submission_methods: ExtractedValue<string>[];
  action_drafts: ActionDraft[];
  information: EventInformation[];
};

export type EventChangeDraft = Omit<EventChange, "id" | "created_at">;

export type ConflictDetectionResult = {
  state: "none" | "update_supported" | "unresolved";
  changes: EventChangeDraft[];
};

export type ReviewDecisionResult = {
  decision: ReviewDecision;
  confidence: ConfidenceScore;
  reasons: string[];
};

export type UserRoleContext = {
  user_id: string;
  identifiers: string[];
  memberships: Array<{
    role: "student" | "class_committee" | "review_group" | "teacher" | "organization";
    label: string;
    verified: boolean;
  }>;
  memberships_complete: boolean;
};

export type EventCandidateSnapshot = {
  event: Event;
  actions: Action[];
};

export type EventEngineInput = {
  messages: NormalizedMessage[];
  user_context: UserRoleContext;
  existing_events: EventCandidateSnapshot[];
};

export type ClassificationStage = {
  run(input: { messages: NormalizedMessage[] }): Promise<StageResult<ClassificationResult>>;
};

export type EventMatchingStage = {
  run(input: {
    messages: NormalizedMessage[];
    classification: StageResult<ClassificationResult>;
    existing_events: EventCandidateSnapshot[];
    config: EventEngineConfig;
  }): Promise<StageResult<EventMatchResult>>;
};

export type RoleResolutionStage = {
  run(input: {
    messages: NormalizedMessage[];
    classification: StageResult<ClassificationResult>;
    user_context: UserRoleContext;
  }): Promise<StageResult<RoleResolutionResult>>;
};

export type EntityExtractionStage = {
  run(input: {
    messages: NormalizedMessage[];
    classification: StageResult<ClassificationResult>;
    roles: StageResult<RoleResolutionResult>;
  }): Promise<StageResult<EntityExtractionResult>>;
};

export type ConflictDetectionStage = {
  run(input: {
    messages: NormalizedMessage[];
    match: StageResult<EventMatchResult>;
    entities: StageResult<EntityExtractionResult>;
    existing_events: EventCandidateSnapshot[];
    config: EventEngineConfig;
  }): Promise<StageResult<ConflictDetectionResult>>;
};

export type ReviewDecisionStage = {
  run(input: {
    messages: NormalizedMessage[];
    classification: StageResult<ClassificationResult>;
    match: StageResult<EventMatchResult>;
    roles: StageResult<RoleResolutionResult>;
    entities: StageResult<EntityExtractionResult>;
    conflicts: StageResult<ConflictDetectionResult>;
    config: EventEngineConfig;
  }): Promise<StageResult<ReviewDecisionResult>>;
};

export type EventAssembler = {
  run(input: {
    messages: NormalizedMessage[];
    classification: StageResult<ClassificationResult>;
    match: StageResult<EventMatchResult>;
    roles: StageResult<RoleResolutionResult>;
    entities: StageResult<EntityExtractionResult>;
    conflicts: StageResult<ConflictDetectionResult>;
    review: StageResult<ReviewDecisionResult>;
  }): Promise<StageResult<Event>>;
};

export type ActionGenerator = {
  run(input: {
    event: Event;
    entities: StageResult<EntityExtractionResult>;
    roles: StageResult<RoleResolutionResult>;
    review: StageResult<ReviewDecisionResult>;
  }): Promise<StageResult<Action[]>>;
};

export type CandidateTaskProjector = {
  run(input: { event: Event; actions: Action[] }): Promise<StageResult<CandidateTask[]>>;
};

export type EventEngineStages = {
  classification: ClassificationStage;
  event_matching: EventMatchingStage;
  role_resolution: RoleResolutionStage;
  entity_extraction: EntityExtractionStage;
  conflict_detection: ConflictDetectionStage;
  review_decision: ReviewDecisionStage;
  event_assembler: EventAssembler;
  action_generator: ActionGenerator;
  candidate_task_projector: CandidateTaskProjector;
};

export type EventEngineResult = {
  classification: StageResult<ClassificationResult>;
  match: StageResult<EventMatchResult>;
  roles: StageResult<RoleResolutionResult>;
  entities: StageResult<EntityExtractionResult>;
  conflicts: StageResult<ConflictDetectionResult>;
  review: StageResult<ReviewDecisionResult>;
  event: StageResult<Event>;
  actions: StageResult<Action[]>;
  candidate_tasks: StageResult<CandidateTask[]>;
};

function emptyStage<T>(value: T): StageResult<T> {
  return { outcome: "ok", value, confidence: 1, issues: [] };
}

// Orchestration is pure backend business logic. Source adapters end at
// NormalizedMessage; this service never branches on image/file/WeCom/etc.
export class EventEngineService {
  private readonly stages: EventEngineStages;
  private readonly config: EventEngineConfig;

  constructor(
    stages: EventEngineStages,
    config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
  ) {
    this.stages = stages;
    this.config = config;
  }

  async process(input: EventEngineInput): Promise<EventEngineResult> {
    if (!input.messages.length) throw new Error("Event Engine requires at least one NormalizedMessage");
    const classification = await this.stages.classification.run({ messages: input.messages });
    const match = await this.stages.event_matching.run({
      messages: input.messages,
      classification,
      existing_events: input.existing_events,
      config: this.config,
    });
    const roles = await this.stages.role_resolution.run({
      messages: input.messages,
      classification,
      user_context: input.user_context,
    });
    const entities = await this.stages.entity_extraction.run({ messages: input.messages, classification, roles });
    const conflicts = await this.stages.conflict_detection.run({
      messages: input.messages,
      match,
      entities,
      existing_events: input.existing_events,
      config: this.config,
    });
    let review = await this.stages.review_decision.run({
      messages: input.messages,
      classification,
      match,
      roles,
      entities,
      conflicts,
      config: this.config,
    });
    if (
      review.value.decision === "AUTO_CANDIDATE" &&
      [classification, match, roles, entities, conflicts].some((stage) => stage.outcome === "failed")
    ) {
      review = {
        outcome: "degraded",
        confidence: 0,
        issues: [
          ...review.issues,
          { code: "upstream_stage_failed", message: "A failed stage cannot produce an automatic candidate.", source_message_ids: input.messages.map((message) => message.id) },
        ],
        value: { decision: "NEEDS_REVIEW", confidence: 0, reasons: [...review.value.reasons, "upstream_stage_failed"] },
      };
    }
    const event = await this.stages.event_assembler.run({ messages: input.messages, classification, match, roles, entities, conflicts, review });
    const actions = review.value.decision === "INFORMATION_ONLY"
      ? emptyStage<Action[]>([])
      : await this.stages.action_generator.run({ event: event.value, entities, roles, review });
    const candidateTasks = review.value.decision === "AUTO_CANDIDATE" && event.outcome !== "failed" && actions.outcome !== "failed"
      ? await this.stages.candidate_task_projector.run({ event: event.value, actions: actions.value })
      : emptyStage<CandidateTask[]>([]);
    return { classification, match, roles, entities, conflicts, review, event, actions, candidate_tasks: candidateTasks };
  }
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function rounded(value: number): number {
  return Math.round(clamp(value) * 1000) / 1000;
}

export function confidenceLevel(score: number, config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG): ConfidenceLevel {
  const value = clamp(score);
  if (value >= config.confidence_levels.high_min) return "high";
  if (value >= config.confidence_levels.medium_min) return "medium";
  return "low";
}

export function normalizedMessageConfidence(
  confidence: NormalizedMessage["confidence"],
  config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
): number {
  return config.normalized_message_scores[confidence];
}

export type DuplicateEvidence = {
  canonical_text_match: boolean;
  attachment_fingerprint_match: boolean;
  official_reference_match: boolean;
  topic_similarity: number;
  key_entity_overlap: number;
};

export function hasStrongDuplicateEvidence(
  evidence: DuplicateEvidence,
  config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
): boolean {
  return evidence.canonical_text_match
    || evidence.attachment_fingerprint_match
    || (
      evidence.official_reference_match
      && evidence.topic_similarity >= config.deduplication.reference_topic_min
      && evidence.key_entity_overlap >= config.deduplication.reference_entity_min
    );
}

export function mergeSourceMessageIds(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}

export type ActionIdentityInput = {
  event_id: string;
  action_type: ActionType;
  actor_role: ParticipantRole;
  deadline: string | null;
  materials: string[];
  submission_method: string | null;
};

function canonicalIdentityText(value: string | null): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function actionIdentityKey(action: ActionIdentityInput): string {
  return JSON.stringify([
    action.event_id,
    action.action_type,
    action.actor_role,
    canonicalIdentityText(action.deadline),
    [...action.materials].map(canonicalIdentityText).sort(),
    canonicalIdentityText(action.submission_method),
  ]);
}

export type EventMatchSignals = {
  factors: EventMatchFactors;
  strong_anchor: boolean;
  explicit_update: boolean;
  hard_identity_conflict: boolean;
};

export function scoreEventMatch(
  signals: EventMatchSignals,
  config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
): number {
  const weighted = Object.entries(config.event_matching.weights).reduce((sum, [name, weight]) => {
    return sum + clamp(signals.factors[name as EventMatchFactorName]) * weight;
  }, 0);
  let score = weighted + (signals.explicit_update ? config.event_matching.explicit_update_bonus : 0);
  if (signals.strong_anchor && !signals.hard_identity_conflict) score = Math.max(score, config.event_matching.strong_anchor_floor);
  if (signals.hard_identity_conflict) score = Math.min(score, config.event_matching.hard_identity_conflict_cap);
  return rounded(score);
}

export function decideEventMatch(input: {
  has_existing_candidate: boolean;
  matched_event_id?: string;
  match_score: number;
  runner_up_gap?: number;
  strong_duplicate?: boolean;
  hard_identity_conflict?: boolean;
  factors: EventMatchFactors;
}, config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG): EventMatchResult {
  const score = clamp(input.match_score);
  const gap = clamp(input.runner_up_gap ?? 1);
  const strongDuplicate = Boolean(input.strong_duplicate);
  const hardConflict = Boolean(input.hard_identity_conflict);
  let decision: EventMatchDecision;
  let confidence: number;
  if (!input.has_existing_candidate) {
    decision = "create_new_event";
    confidence = 1;
  } else if (!hardConflict && score >= config.event_matching.merge_min && gap >= config.event_matching.minimum_runner_up_gap) {
    decision = "merge_existing_event";
    confidence = score;
  } else if (score <= config.event_matching.create_new_max && !strongDuplicate) {
    decision = "create_new_event";
    confidence = 1 - score;
  } else {
    decision = "uncertain_needs_review";
    confidence = Math.min(score, 1 - score);
  }
  return {
    decision,
    matched_event_id: decision === "merge_existing_event" ? input.matched_event_id ?? null : null,
    match_score: rounded(score),
    decision_confidence: rounded(confidence),
    runner_up_gap: rounded(gap),
    factors: input.factors,
    strong_duplicate: strongDuplicate,
    hard_identity_conflict: hardConflict,
  };
}

export function roleAppliesToUser(input: {
  role: ParticipantRole;
  user_context: UserRoleContext;
  exact_user_match?: boolean;
  explicit_non_match?: boolean;
}): boolean | null {
  if (input.explicit_non_match) return false;
  if (input.role === "user" || input.exact_user_match) return true;
  const verified = new Set(input.user_context.memberships.filter((membership) => membership.verified).map((membership) => membership.role));
  if (input.role === "all_students") {
    if (verified.has("student")) return true;
    return input.user_context.memberships_complete ? false : null;
  }
  if (input.role === "specific_students") return null;
  if (["class_committee", "review_group", "teacher", "organization"].includes(input.role)) {
    if (verified.has(input.role as "class_committee" | "review_group" | "teacher" | "organization")) return true;
    return input.user_context.memberships_complete ? false : null;
  }
  return null;
}

export type CandidateDecisionInput = {
  has_action_cue: boolean;
  is_information_only: boolean;
  applies_to_user: boolean | null;
  event_match_decision: EventMatchDecision;
  unresolved_conflict: boolean;
  deadline_expected: boolean;
  confidence: ConfidenceBreakdown;
};

export function decideCandidate(
  input: CandidateDecisionInput,
  config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
): ReviewDecisionResult {
  if ((!input.has_action_cue || input.is_information_only) && input.applies_to_user !== true) {
    return { decision: "INFORMATION_ONLY", confidence: 1, reasons: ["no_user_action"] };
  }
  if (!input.has_action_cue || input.is_information_only || input.applies_to_user === false) {
    return { decision: "INFORMATION_ONLY", confidence: 1, reasons: ["information_only"] };
  }
  const reasons: string[] = [];
  if (input.applies_to_user === null) reasons.push("role_membership_unknown");
  if (input.event_match_decision === "uncertain_needs_review") reasons.push("event_match_uncertain");
  if (input.unresolved_conflict) reasons.push("unresolved_conflict");
  const gates: Array<[keyof ConfidenceBreakdown, number]> = [
    ["normalization_confidence", config.auto_candidate.normalization_min],
    ["classification_confidence", config.auto_candidate.classification_min],
    ["event_match_confidence", config.auto_candidate.event_match_min],
    ["role_confidence", config.auto_candidate.role_min],
    ["entity_confidence", config.auto_candidate.entity_min],
    ["action_confidence", config.auto_candidate.action_min],
  ];
  if (input.deadline_expected) gates.push(["deadline_confidence", config.auto_candidate.deadline_min]);
  for (const [dimension, threshold] of gates) {
    const value = input.confidence[dimension];
    if (value === null || value < threshold) reasons.push(`${dimension}_below_threshold`);
  }
  const evaluated = gates.map(([dimension]) => input.confidence[dimension]).filter((value): value is number => value !== null);
  const confidence = evaluated.length ? Math.min(...evaluated.map(clamp)) : 0;
  if (reasons.length) return { decision: "NEEDS_REVIEW", confidence: rounded(confidence), reasons };
  return { decision: "AUTO_CANDIDATE", confidence: rounded(confidence), reasons: [] };
}

export type EvidenceAuthority = keyof EventEngineConfig["conflict_resolution"]["authority_scores"];

export type ConflictEvidence = {
  value: unknown;
  authority: EvidenceAuthority;
  explicit_update: boolean;
  verified_publisher_role: boolean;
  extraction_confidence: number;
  corroboration: number;
  recency: number;
  source_message_ids: string[];
};

export type FieldConflictResolution = "no_change" | "apply_incoming" | "keep_existing" | "needs_review";

export function conflictEvidencePriority(
  evidence: ConflictEvidence,
  config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
): number {
  const weights = config.conflict_resolution.weights;
  const authority = config.conflict_resolution.authority_scores[evidence.authority];
  return rounded(
    authority * weights.authority
    + (evidence.explicit_update ? 1 : 0) * weights.explicit_update
    + (evidence.verified_publisher_role ? 1 : 0) * weights.verified_publisher_role
    + clamp(evidence.extraction_confidence) * weights.extraction_confidence
    + clamp(evidence.corroboration) * weights.corroboration
    + clamp(evidence.recency) * weights.recency,
  );
}

function comparableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  return JSON.stringify(value);
}

export function resolveFieldConflict(
  current: ConflictEvidence,
  incoming: ConflictEvidence,
  config: EventEngineConfig = DEFAULT_EVENT_ENGINE_CONFIG,
): { resolution: FieldConflictResolution; confidence: number; reason: string } {
  if (comparableValue(current.value) === comparableValue(incoming.value)) {
    return { resolution: "no_change", confidence: 1, reason: "same_value" };
  }
  const authority = config.conflict_resolution.authority_scores;
  const currentAuthority = authority[current.authority];
  const incomingAuthority = authority[incoming.authority];
  const currentPriority = conflictEvidencePriority(current, config);
  const incomingPriority = conflictEvidencePriority(incoming, config);
  const margin = incomingPriority - currentPriority;
  const confidentIncoming = incoming.extraction_confidence >= config.conflict_resolution.minimum_auto_apply_confidence;
  const authorityAcceptable = incomingAuthority + config.conflict_resolution.lower_authority_tolerance >= currentAuthority;
  if (
    incoming.explicit_update
    && confidentIncoming
    && authorityAcceptable
    && margin >= config.conflict_resolution.minimum_priority_margin
  ) {
    return { resolution: "apply_incoming", confidence: rounded(incoming.extraction_confidence), reason: "supported_explicit_update" };
  }
  if (
    !incoming.explicit_update
    && confidentIncoming
    && incomingAuthority - currentAuthority >= config.conflict_resolution.authority_advantage_without_update
    && margin >= config.conflict_resolution.minimum_priority_margin
  ) {
    return { resolution: "apply_incoming", confidence: rounded(incoming.extraction_confidence), reason: "materially_stronger_authority" };
  }
  if (
    !incoming.explicit_update
    && currentPriority - incomingPriority >= config.conflict_resolution.minimum_priority_margin
    && currentAuthority > incomingAuthority
  ) {
    return { resolution: "keep_existing", confidence: rounded(current.extraction_confidence), reason: "existing_evidence_stronger" };
  }
  return { resolution: "needs_review", confidence: rounded(Math.abs(margin)), reason: "conflicting_evidence_close_or_ambiguous" };
}

export function createEventChangeDraft(input: {
  user_id: string;
  event_id: string;
  action_id?: string;
  field: EventChangeField;
  current: ConflictEvidence;
  incoming: ConflictEvidence;
  from_version: number;
  config?: EventEngineConfig;
}): EventChangeDraft | null {
  const outcome = resolveFieldConflict(input.current, input.incoming, input.config);
  if (outcome.resolution === "no_change") return null;
  const resolution: EventChangeResolution = outcome.resolution === "apply_incoming"
    ? "applied"
    : outcome.resolution === "keep_existing" ? "rejected" : "pending_review";
  return {
    user_id: input.user_id,
    event_id: input.event_id,
    action_id: input.action_id ?? null,
    field: input.field,
    old_value: input.current.value,
    new_value: input.incoming.value,
    source_message_ids: mergeSourceMessageIds(input.current.source_message_ids, input.incoming.source_message_ids),
    reason: outcome.reason,
    confidence: outcome.confidence,
    resolution,
    from_version: input.from_version,
    to_version: resolution === "applied" ? input.from_version + 1 : null,
  };
}
