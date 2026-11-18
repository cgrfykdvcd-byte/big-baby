import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(), name: text("name").notNull().default("同学"), viewedDate: text("viewed_date").notNull().default(""),
});
export const entries = sqliteTable("entries", {
  summary:text("summary").notNull().default(""), actionItems:text("action_items").notNull().default("[]"), keywords:text("keywords").notNull().default("[]"), messageCount:integer("message_count").notNull().default(1), extraction:text("extraction").notNull().default("rules"), confidence:text("confidence").notNull().default("需核对"), fileId:text("file_id").notNull().default(""), inboxItemId:text("inbox_item_id").notNull().default(""),
  id:text("id").primaryKey(), userId:text("user_id").notNull(), title:text("title").notNull(), original:text("original").notNull().default(""), source:text("source").notNull(), sourceType:text("source_type").notNull(), category:text("category").notNull(), status:text("status").notNull(), deadline:text("deadline").notNull().default(""), deadlineNote:text("deadline_note").notNull().default(""), planDate:text("plan_date").notNull().default(""), place:text("place").notNull().default(""), recipient:text("recipient").notNull().default(""), method:text("method").notNull().default(""), attachments:text("attachments").notNull().default(""), filename:text("filename").notNull().default(""), reviewedDate:text("reviewed_date").notNull().default(""), createdAt:text("created_at").notNull(), completedAt:text("completed_at").notNull().default(""), sample:integer("sample").notNull().default(0),
},t=>[index("idx_entries_user_created").on(t.userId,t.createdAt)]);
export const inboxItems=sqliteTable("inbox_items",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),sourceType:text("source_type").notNull(),sourceReference:text("source_reference").notNull().default(""),originalText:text("original_text").notNull().default(""),originalLanguage:text("original_language").notNull().default("unknown"),processingStatus:text("processing_status").notNull(),metadata:text("metadata").notNull().default("{}"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),failureReason:text("failure_reason").notNull().default(""),
},t=>[index("idx_inbox_items_user_created").on(t.userId,t.createdAt),index("idx_inbox_items_user_status").on(t.userId,t.processingStatus)]);
export const normalizedMessages=sqliteTable("normalized_messages",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),inboxItemId:text("inbox_item_id").notNull(),normalizationId:text("normalization_id").notNull().default(""),normalizationVersion:integer("normalization_version").notNull().default(1),sourceType:text("source_type").notNull(),sourceId:text("source_id").notNull(),text:text("text").notNull(),language:text("language").notNull(),timestamp:text("timestamp").notNull().default(""),sender:text("sender").notNull().default(""),attachments:text("attachments").notNull().default("[]"),metadata:text("metadata").notNull().default("{}"),confidence:text("confidence").notNull().default("medium"),createdAt:text("created_at").notNull(),
},t=>[index("idx_normalized_messages_user_inbox").on(t.userId,t.inboxItemId)]);
export const inboxNormalizations=sqliteTable("inbox_normalizations",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),inboxItemId:text("inbox_item_id").notNull(),version:integer("version").notNull(),status:text("status").notNull(),failureReason:text("failure_reason").notNull().default(""),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("idx_inbox_normalizations_user_item_version").on(t.userId,t.inboxItemId,t.version),index("idx_inbox_normalizations_user_item").on(t.userId,t.inboxItemId)]);
export const events=sqliteTable("events",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),eventType:text("event_type").notNull(),tags:text("tags").notNull().default("[]"),title:text("title").notNull(),summary:text("summary").notNull().default(""),status:text("status").notNull().default("active"),participants:text("participants").notNull().default("[]"),information:text("information").notNull().default("[]"),version:integer("version").notNull().default(1),decision:text("decision").notNull().default("NEEDS_REVIEW"),confidence:real("confidence").notNull().default(0),confidenceDetails:text("confidence_details").notNull().default("{}"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[index("idx_events_user_updated").on(t.userId,t.updatedAt),index("idx_events_user_status").on(t.userId,t.status)]);
export const eventSources=sqliteTable("event_sources",{
 userId:text("user_id").notNull(),eventId:text("event_id").notNull(),messageId:text("message_id").notNull(),relation:text("relation").notNull().default("supporting"),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("idx_event_sources_user_event_message").on(t.userId,t.eventId,t.messageId),index("idx_event_sources_user_message").on(t.userId,t.messageId)]);
export const eventActions=sqliteTable("event_actions",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),eventId:text("event_id").notNull(),actionType:text("action_type").notNull(),title:text("title").notNull(),actorRole:text("actor_role").notNull(),actorLabel:text("actor_label").notNull().default(""),appliesToUser:integer("applies_to_user"),targetRole:text("target_role").notNull().default("unknown"),targetLabel:text("target_label").notNull().default(""),deadline:text("deadline"),deadlinePrecision:text("deadline_precision").notNull().default("unknown"),location:text("location"),materials:text("materials").notNull().default("[]"),submissionMethod:text("submission_method"),status:text("status").notNull().default("proposed"),sourceMessageIds:text("source_message_ids").notNull().default("[]"),confidence:real("confidence").notNull().default(0),confidenceDetails:text("confidence_details").notNull().default("{}"),requiresConfirmation:integer("requires_confirmation").notNull().default(1),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[index("idx_event_actions_user_event").on(t.userId,t.eventId),index("idx_event_actions_user_status").on(t.userId,t.status)]);
export const eventChanges=sqliteTable("event_changes",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),eventId:text("event_id").notNull(),actionId:text("action_id"),field:text("field").notNull(),oldValue:text("old_value").notNull(),newValue:text("new_value").notNull(),sourceMessageIds:text("source_message_ids").notNull().default("[]"),reason:text("reason").notNull().default(""),confidence:real("confidence").notNull().default(0),resolution:text("resolution").notNull(),fromVersion:integer("from_version").notNull(),toVersion:integer("to_version"),createdAt:text("created_at").notNull(),
},t=>[index("idx_event_changes_user_event").on(t.userId,t.eventId,t.createdAt),index("idx_event_changes_user_resolution").on(t.userId,t.resolution)]);
// User declarations are deliberately Event-scoped. They supplement inferred roles
// without claiming that a user has a permanent institution-verified membership.
export const userRoleRelations=sqliteTable("user_role_relations",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),eventId:text("event_id").notNull(),role:text("role").notNull(),context:text("context").notNull().default(""),status:text("status").notNull(),source:text("source").notNull().default("user"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_user_role_relations_scope").on(t.userId,t.eventId,t.role,t.context),index("idx_user_role_relations_user_event").on(t.userId,t.eventId)]);
export const checkins=sqliteTable("checkins", {
  id:text("id").primaryKey(), userId:text("user_id").notNull(), date:text("date").notNull(),
},t=>[uniqueIndex("idx_checkins_user_date").on(t.userId,t.date)]);

export const accounts=sqliteTable("accounts",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),username:text("username").notNull(),passwordHash:text("password_hash").notNull(),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("idx_accounts_username").on(t.username),uniqueIndex("idx_accounts_user").on(t.userId)]);
export const sessions=sqliteTable("sessions",{
 tokenHash:text("token_hash").primaryKey(),userId:text("user_id").notNull(),expiresAt:integer("expires_at").notNull(),
},t=>[index("idx_sessions_user").on(t.userId)]);
export const rateLimits=sqliteTable("rate_limits",{
 key:text("key").primaryKey(),count:integer("count").notNull(),expiresAt:integer("expires_at").notNull(),
});
export const integrations=sqliteTable("integrations",{
 userId:text("user_id").primaryKey(),baseUrl:text("base_url").notNull().default(""),model:text("model").notNull().default(""),visionModel:text("vision_model").notNull().default(""),apiKey:text("api_key").notNull().default(""),enabled:integer("enabled").notNull().default(0),
});
export const inboundSources=sqliteTable("inbound_sources",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),name:text("name").notNull(),secretHash:text("secret_hash").notNull(),lastReceived:text("last_received").notNull().default(""),createdAt:text("created_at").notNull(),
},t=>[index("idx_sources_user").on(t.userId)]);
export const inboundReceipts=sqliteTable("inbound_receipts",{
 id:text("id").primaryKey(),sourceId:text("source_id").notNull(),externalId:text("external_id").notNull(),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("idx_receipts_source_external").on(t.sourceId,t.externalId)]);
// External clients use a scoped, revocable credential. It never replaces the
// application's login identity and its raw secret is never stored.
export const externalIntegrationCredentials=sqliteTable("external_integration_credentials",{
 id:text("id").primaryKey(),provider:text("provider").notNull(),userId:text("user_id").notNull(),secretHash:text("secret_hash").notNull(),status:text("status").notNull().default("active"),createdAt:text("created_at").notNull(),revokedAt:text("revoked_at"),lastUsedAt:text("last_used_at"),
},t=>[uniqueIndex("idx_external_integration_credentials_provider_secret").on(t.provider,t.secretHash),index("idx_external_integration_credentials_user").on(t.userId,t.provider,t.status)]);
// A receipt claims one idempotency key before Inbox processing starts. A retry
// returns its stored result instead of creating another evidence chain.
export const externalIntegrationReceipts=sqliteTable("external_integration_receipts",{
 id:text("id").primaryKey(),credentialId:text("credential_id").notNull(),externalRequestId:text("external_request_id").notNull(),inboxItemId:text("inbox_item_id").notNull().default(""),status:text("status").notNull().default("processing"),resultJson:text("result_json").notNull().default("{}"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_external_integration_receipts_credential_request").on(t.credentialId,t.externalRequestId),index("idx_external_integration_receipts_credential_status").on(t.credentialId,t.status)]);
// OAuth records are separate from handoff credentials. All bearer/code material
// is stored as SHA-256 digests; one OAuth grant owns one existing credential.
export const mcpOAuthClients=sqliteTable("mcp_oauth_clients",{
 id:text("id").primaryKey(),redirectUris:text("redirect_uris").notNull(),createdAt:text("created_at").notNull(),
});
export const mcpOAuthCodes=sqliteTable("mcp_oauth_codes",{
 codeHash:text("code_hash").primaryKey(),userId:text("user_id").notNull(),clientId:text("client_id").notNull(),redirectUri:text("redirect_uri").notNull(),codeChallenge:text("code_challenge").notNull(),resource:text("resource").notNull(),scope:text("scope").notNull(),expiresAt:integer("expires_at").notNull(),usedAt:text("used_at"),createdAt:text("created_at").notNull(),
},t=>[index("idx_mcp_oauth_codes_expiry").on(t.expiresAt)]);
export const mcpOAuthTokens=sqliteTable("mcp_oauth_tokens",{
 tokenHash:text("token_hash").primaryKey(),credentialId:text("credential_id").notNull(),userId:text("user_id").notNull(),clientId:text("client_id").notNull(),familyId:text("family_id").notNull(),kind:text("kind").notNull(),resource:text("resource").notNull(),scope:text("scope").notNull(),expiresAt:integer("expires_at").notNull(),revokedAt:text("revoked_at"),createdAt:text("created_at").notNull(),
},t=>[index("idx_mcp_oauth_tokens_family").on(t.familyId),index("idx_mcp_oauth_tokens_credential").on(t.credentialId),index("idx_mcp_oauth_tokens_expiry").on(t.expiresAt)]);
// External identities never replace the application's account identity. A mapping
// must be verified before a provider callback can be attributed to an internal user.
export const externalIdentities=sqliteTable("external_identities",{
 id:text("id").primaryKey(),provider:text("provider").notNull(),externalUserId:text("external_user_id").notNull(),internalUserId:text("internal_user_id").notNull(),verificationStatus:text("verification_status").notNull().default("pending"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_external_identities_provider_user").on(t.provider,t.externalUserId),index("idx_external_identities_internal_user").on(t.internalUserId)]);
// A challenge proves control of a WeCom identity through the already verified
// callback channel. The token itself is never persisted, only its digest.
export const wecomBindingChallenges=sqliteTable("wecom_binding_challenges",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),tokenHash:text("token_hash").notNull(),status:text("status").notNull().default("pending"),externalUserId:text("external_user_id").notNull().default(""),expiresAt:integer("expires_at").notNull(),usedAt:text("used_at"),replayStatus:text("replay_status").notNull().default("pending"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_wecom_binding_challenges_token").on(t.tokenHash),index("idx_wecom_binding_challenges_user").on(t.userId,t.status),index("idx_wecom_binding_challenges_expiry").on(t.expiresAt)]);
// The encrypted callback is retained for traceability and replay-safe retry without
// persisting message plaintext outside the existing Inbox/evidence chain.
export const wecomCallbacks=sqliteTable("wecom_callbacks",{
 id:text("id").primaryKey(),dedupKey:text("dedup_key").notNull(),messageId:text("message_id").notNull().default(""),externalUserId:text("external_user_id").notNull().default(""),messageType:text("message_type").notNull().default(""),encryptedPayload:text("encrypted_payload").notNull(),status:text("status").notNull(),mappingStatus:text("mapping_status").notNull().default("unknown"),inboxItemId:text("inbox_item_id").notNull().default(""),errorCode:text("error_code").notNull().default(""),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_wecom_callbacks_dedup").on(t.dedupKey),index("idx_wecom_callbacks_external_user").on(t.externalUserId),index("idx_wecom_callbacks_status").on(t.status)]);
// Notification delivery is deliberately separate from Event Engine decisions.
// `dedup_key` makes reminder scheduling repeat-safe while keeping cancelled
// history available for audit and future provider retries.
export const notifications=sqliteTable("notifications",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),eventId:text("event_id").notNull(),actionId:text("action_id").notNull(),channel:text("channel").notNull(),priority:text("priority").notNull().default("normal"),status:text("status").notNull().default("scheduled"),scheduledAt:text("scheduled_at").notNull(),sentAt:text("sent_at"),templateKey:text("template_key").notNull(),payload:text("payload").notNull().default("{}"),dedupKey:text("dedup_key").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_notifications_user_dedup").on(t.userId,t.dedupKey),index("idx_notifications_user_schedule").on(t.userId,t.status,t.scheduledAt),index("idx_notifications_action").on(t.userId,t.actionId)]);
export const notificationPreferences=sqliteTable("notification_preferences",{
 userId:text("user_id").primaryKey(),webEnabled:integer("web_enabled").notNull().default(1),wecomEnabled:integer("wecom_enabled").notNull().default(0),pushEnabled:integer("push_enabled").notNull().default(0),smsEnabled:integer("sms_enabled").notNull().default(0),calendarEnabled:integer("calendar_enabled").notNull().default(1),criticalSmsEnabled:integer("critical_sms_enabled").notNull().default(0),quietHoursStart:text("quiet_hours_start").notNull().default(""),quietHoursEnd:text("quiet_hours_end").notNull().default(""),deadline1dEnabled:integer("deadline_1d_enabled").notNull().default(1),deadline2hEnabled:integer("deadline_2h_enabled").notNull().default(1),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});
export const calendarRecords=sqliteTable("calendar_records",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),eventId:text("event_id").notNull(),actionId:text("action_id").notNull(),provider:text("provider").notNull(),externalCalendarEventId:text("external_calendar_event_id").notNull().default(""),status:text("status").notNull().default("active"),lastSyncedAt:text("last_synced_at"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("idx_calendar_records_user_action_provider").on(t.userId,t.actionId,t.provider),index("idx_calendar_records_user_status").on(t.userId,t.status)]);
export const files=sqliteTable("files",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),name:text("name").notNull(),mime:text("mime").notNull(),size:integer("size").notNull(),objectKey:text("object_key").notNull(),text:text("text").notNull().default(""),status:text("status").notNull().default("stored"),createdAt:text("created_at").notNull(),
},t=>[index("idx_files_user_created").on(t.userId,t.createdAt)]);
export const scheduleEvents=sqliteTable("schedule_events",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),title:text("title").notNull(),date:text("date").notNull(),start:text("start").notNull(),end:text("end").notNull(),repeatUntil:text("repeat_until").notNull().default(""),weekdays:text("weekdays").notNull().default("[]"),location:text("location").notNull().default(""),kind:text("kind").notNull().default("event"),notes:text("notes").notNull().default(""),fileId:text("file_id").notNull().default(""),
},t=>[index("idx_schedule_user_date").on(t.userId,t.date)]);
export const analysisRuns=sqliteTable('analysis_runs',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),kind:text('kind').notNull(),engine:text('engine').notNull(),count:integer('count').notNull(),warnings:text('warnings').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_analysis_user_created').on(t.userId,t.createdAt)]);
export const entryVersions=sqliteTable('entry_versions',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),entryId:text('entry_id').notNull(),before:text('before_json').notNull(),after:text('after_json').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_versions_user_entry').on(t.userId,t.entryId)]);
export const scheduleCompletions=sqliteTable('schedule_completions',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),eventId:text('event_id').notNull(),date:text('date').notNull(),
},t=>[uniqueIndex('idx_schedule_completions_user_event_day').on(t.userId,t.eventId,t.date)]);
