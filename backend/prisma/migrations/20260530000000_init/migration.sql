CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "Role" AS ENUM ('Admin', 'Manager', 'Member');
CREATE TYPE "MeetingStatus" AS ENUM ('Scheduled', 'InProgress', 'Completed', 'Archived');
CREATE TYPE "MeetingRole" AS ENUM ('Host', 'CoHost', 'Participant');
CREATE TYPE "FileType" AS ENUM ('Audio', 'Video', 'Transcript', 'Other');
CREATE TYPE "SentimentLabel" AS ENUM ('Positive', 'Neutral', 'Negative');
CREATE TYPE "BehaviorLabel" AS ENUM ('Agreement', 'Disagreement', 'Suggestion', 'Question', 'Decision', 'Action');
CREATE TYPE "SummaryType" AS ENUM ('Executive', 'Detailed', 'ActionItems', 'KeyDecisions');
CREATE TYPE "ActionItemStatus" AS ENUM ('Todo', 'InProgress', 'Done');
CREATE TYPE "Priority" AS ENUM ('Low', 'Medium', 'High', 'Critical');

CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "role" "Role" NOT NULL DEFAULT 'Member',
  "token_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE "meetings" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "start_time" TIMESTAMP(3),
  "end_time" TIMESTAMP(3),
  "passcode" TEXT,
  "status" "MeetingStatus" NOT NULL DEFAULT 'Scheduled',
  "folder_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE "meeting_participants" (
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "meeting_role" "MeetingRole" NOT NULL DEFAULT 'Participant',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("meeting_id", "user_id")
);

CREATE TABLE "speakers" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "speaker_label" TEXT NOT NULL,
  "real_name" TEXT,
  "color_hex" TEXT,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "speakers_meeting_label_key" UNIQUE ("meeting_id", "speaker_label")
);

CREATE TABLE "transcripts" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "speaker_id" TEXT REFERENCES "speakers"("id") ON DELETE SET NULL,
  "start_timestamp" DECIMAL(12,3),
  "end_timestamp" DECIMAL(12,3),
  "original_text" TEXT NOT NULL,
  "translated_text" TEXT,
  "sentiment_label" "SentimentLabel",
  "behavior_label" "BehaviorLabel",
  "is_highlighted" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE "summaries" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "summary_type" "SummaryType" NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "meeting_keywords" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "keyword" TEXT NOT NULL,
  "frequency_count" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "meeting_keywords_meeting_keyword_key" UNIQUE ("meeting_id", "keyword")
);

CREATE TABLE "meeting_files" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "file_type" "FileType" NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_name" TEXT,
  "mime_type" TEXT,
  "file_size" BIGINT NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE "action_items" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "task_content" TEXT NOT NULL,
  "assignee_name" TEXT,
  "deadline" TIMESTAMP(3),
  "priority" "Priority" NOT NULL DEFAULT 'Medium',
  "status" "ActionItemStatus" NOT NULL DEFAULT 'Todo',
  "source_transcript_id" TEXT REFERENCES "transcripts"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE "user_bookmark_notes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" TEXT NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transcript_id" TEXT REFERENCES "transcripts"("id") ON DELETE SET NULL,
  "note_content" TEXT,
  "is_bookmark" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE TABLE "system_logs" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "action_type" TEXT NOT NULL,
  "ip_address" TEXT,
  "details" JSONB
);

CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "meetings_status_start_time_idx" ON "meetings"("status", "start_time");
CREATE INDEX "meetings_created_at_idx" ON "meetings"("created_at");
CREATE INDEX "meetings_deleted_at_idx" ON "meetings"("deleted_at");
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants"("user_id");
CREATE INDEX "speakers_meeting_id_idx" ON "speakers"("meeting_id");
CREATE INDEX "speakers_deleted_at_idx" ON "speakers"("deleted_at");
CREATE INDEX "transcripts_meeting_time_idx" ON "transcripts"("meeting_id", "start_timestamp");
CREATE INDEX "transcripts_speaker_id_idx" ON "transcripts"("speaker_id");
CREATE INDEX "transcripts_sentiment_label_idx" ON "transcripts"("sentiment_label");
CREATE INDEX "transcripts_behavior_label_idx" ON "transcripts"("behavior_label");
CREATE INDEX "transcripts_deleted_at_idx" ON "transcripts"("deleted_at");
CREATE INDEX "summaries_meeting_type_idx" ON "summaries"("meeting_id", "summary_type");
CREATE INDEX "meeting_keywords_frequency_count_idx" ON "meeting_keywords"("frequency_count");
CREATE INDEX "meeting_files_meeting_type_idx" ON "meeting_files"("meeting_id", "file_type");
CREATE INDEX "meeting_files_deleted_at_idx" ON "meeting_files"("deleted_at");
CREATE INDEX "action_items_meeting_status_idx" ON "action_items"("meeting_id", "status");
CREATE INDEX "action_items_priority_idx" ON "action_items"("priority");
CREATE INDEX "action_items_deleted_at_idx" ON "action_items"("deleted_at");
CREATE INDEX "user_bookmark_notes_meeting_user_idx" ON "user_bookmark_notes"("meeting_id", "user_id");
CREATE INDEX "user_bookmark_notes_transcript_id_idx" ON "user_bookmark_notes"("transcript_id");
CREATE INDEX "user_bookmark_notes_deleted_at_idx" ON "user_bookmark_notes"("deleted_at");
CREATE INDEX "system_logs_timestamp_idx" ON "system_logs"("timestamp");
CREATE INDEX "system_logs_user_id_idx" ON "system_logs"("user_id");
CREATE INDEX "system_logs_action_type_idx" ON "system_logs"("action_type");
