export const EVENT_MATCH_FACTOR_NAMES = [
  "topic_semantic",
  "key_entity_overlap",
  "existing_event_continuity",
  "publisher_consistency",
  "deadline_compatibility",
  "attachment_evidence",
  "temporal_proximity",
  "location_compatibility",
  "source_corroboration",
] as const;

export type EventMatchFactorName = (typeof EVENT_MATCH_FACTOR_NAMES)[number];

export type EventEngineConfig = {
  confidence_levels: {
    high_min: number;
    medium_min: number;
  };
  normalized_message_scores: {
    high: number;
    medium: number;
    low: number;
  };
  event_matching: {
    weights: Record<EventMatchFactorName, number>;
    merge_min: number;
    create_new_max: number;
    minimum_runner_up_gap: number;
    strong_anchor_floor: number;
    explicit_update_bonus: number;
    hard_identity_conflict_cap: number;
  };
  deduplication: {
    reference_topic_min: number;
    reference_entity_min: number;
  };
  auto_candidate: {
    normalization_min: number;
    classification_min: number;
    event_match_min: number;
    role_min: number;
    entity_min: number;
    action_min: number;
    deadline_min: number;
  };
  conflict_resolution: {
    authority_scores: {
      official: number;
      verified_staff: number;
      organization: number;
      class_committee: number;
      peer: number;
      unknown: number;
    };
    weights: {
      authority: number;
      explicit_update: number;
      verified_publisher_role: number;
      extraction_confidence: number;
      corroboration: number;
      recency: number;
    };
    minimum_priority_margin: number;
    minimum_auto_apply_confidence: number;
    lower_authority_tolerance: number;
    authority_advantage_without_update: number;
  };
};

// V2 defaults are deliberately conservative and injectable. They are policy,
// not model constants, and must not be duplicated inside classifiers or routes.
export const DEFAULT_EVENT_ENGINE_CONFIG: EventEngineConfig = {
  confidence_levels: {
    high_min: 0.85,
    medium_min: 0.6,
  },
  normalized_message_scores: {
    high: 0.9,
    medium: 0.7,
    low: 0.4,
  },
  event_matching: {
    weights: {
      topic_semantic: 0.25,
      key_entity_overlap: 0.2,
      existing_event_continuity: 0.15,
      publisher_consistency: 0.1,
      deadline_compatibility: 0.08,
      attachment_evidence: 0.08,
      temporal_proximity: 0.06,
      location_compatibility: 0.04,
      source_corroboration: 0.04,
    },
    merge_min: 0.82,
    create_new_max: 0.48,
    minimum_runner_up_gap: 0.12,
    strong_anchor_floor: 0.9,
    explicit_update_bonus: 0.05,
    hard_identity_conflict_cap: 0.45,
  },
  deduplication: {
    reference_topic_min: 0.8,
    reference_entity_min: 0.7,
  },
  auto_candidate: {
    normalization_min: 0.65,
    classification_min: 0.75,
    event_match_min: 0.82,
    role_min: 0.85,
    entity_min: 0.75,
    action_min: 0.85,
    deadline_min: 0.8,
  },
  conflict_resolution: {
    authority_scores: {
      official: 1,
      verified_staff: 0.9,
      organization: 0.82,
      class_committee: 0.72,
      peer: 0.45,
      unknown: 0.3,
    },
    weights: {
      authority: 0.35,
      explicit_update: 0.25,
      verified_publisher_role: 0.15,
      extraction_confidence: 0.15,
      corroboration: 0.05,
      recency: 0.05,
    },
    minimum_priority_margin: 0.12,
    minimum_auto_apply_confidence: 0.8,
    lower_authority_tolerance: 0.05,
    authority_advantage_without_update: 0.35,
  },
};
