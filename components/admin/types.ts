// Shared types for the AgentifyAI Founder Admin Console.
// These mirror the backend `GET /admin/console` (build_admin_console_payload) payload.

export type HealthState = "healthy" | "warning" | "error" | "unknown";

export interface ConsoleMetric {
  value: number | string | null;
  source: string;
  unit?: string;
  note?: string;
}

export interface AgentSourceUsage {
  source: string;
  chunks: number;
  rows: number;
}

export interface AgentDataIntake {
  trace_rows: number;
  event_rows: number;
  new_trace_rows_24h: number;
  previous_trace_rows_24h: number;
  new_event_rows_24h: number;
  previous_event_rows_24h: number;
  model_calls: number;
  tool_calls: number;
  turns: number;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  memory_rows: number;
  sources: AgentSourceUsage[];
}

export interface AgentEvolution {
  version: string;
  runs_total: number;
  runs_24h: number;
  quality_score_current: number | null;
  latency_current_ms: number | null;
  success_rate: number;
  learning_signal: string;
  new_data_rows: number;
  historical_data_rows: number;
}

export interface AgentStatus {
  agent_id: string;
  display_name: string;
  role?: string;
  status: string;
  health: string;
  current_task: string;
  last_activity: string;
  total_requests: number;
  total_errors: number;
  total_success: number;
  avg_latency_ms: number;
  last_quality_score: number;
  success_rate: number;
  data_intake?: AgentDataIntake;
  evolution?: AgentEvolution;
}

export interface AdminTrace {
  id: number;
  created_at: string;
  turn_id: string;
  session_id: string;
  user_id: string;
  trace_type: string;
  name: string;
  provider: string;
  model: string;
  status: string;
  latency_ms: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  metadata: Record<string, unknown>;
}

export interface StudentRow {
  user_id: string;
  display_name: string;
  class_level: string;
  onboarding_completed: boolean;
  xp: number;
  level: number;
  streak: number;
  total_tests: number;
  total_questions: number;
  total_correct: number;
  accuracy: number;
  last_active_date: string | null;
  focus_score: number;
}

export interface ContentJob {
  job_id: string;
  job_type: string;
  status: string;
  source_path: string;
  created_at: string;
  summary: Record<string, unknown>;
}

export interface AuditRow {
  id: number;
  created_at: string;
  actor_uid: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  status: string;
  metadata: Record<string, unknown>;
}

// ── Detailed content ingestion report (GET /admin/content/ingestion-report) ──
export interface ReportConcept {
  concept_id: string;
  title: string;
  difficulty_level: number;
  importance_level: string;
  typical_exam_weightage: string;
  blooms_taxonomy: string;
  key_points: number;
  examples: number;
  formulas: number;
  source_pages: number[];
  has_definition: boolean;
  validation_issues: number;
  chars: number;
  tokens: number;
}

export interface ReportChapter {
  id: number;
  board: string;
  class_level: string;
  subject: string;
  book_name: string;
  chapter_number: number | null;
  chapter_name: string;
  slug: string;
  status: string;
  is_live: boolean;
  version: string;
  page_count: number;
  extracted_page_count: number;
  concept_count: number;
  chunk_count: number;
  embedded_chunks: number;
  coverage_score: number;
  extraction_quality: number;
  ready_for_approval: boolean | null;
  blocking_issue_count: number | null;
  missing_source_pages: number[];
  issues: Array<{ severity: string; message: string; concept_id: string }>;
  approved_by: string | null;
  approved_at: string;
  published_at: string;
  updated_at: string;
  source_hash: string;
  published_source_hash: string;
  // data / memory sizing
  chunk_chars: number;
  page_chars: number;
  concept_chars: number;
  chunk_tokens: number;
  embedding_dims: number;
  embedding_bytes: number;
  memory_bytes: number;
  concepts_with_issues: number;
  error_rate: number;
  concepts: ReportConcept[];
  concepts_truncated: boolean;
}

export interface ContentReport {
  generated_at: string;
  database_dialect: string;
  embeddings_enabled: boolean;
  embeddings_model: string;
  status_filter: string;
  totals: {
    chapters: number;
    pages: number;
    extracted_pages: number;
    concepts: number;
    chunks: number;
    embedded_chunks: number;
    chunk_chars: number;
    page_chars: number;
    concept_chars: number;
    tokens: number;
    embedding_bytes: number;
    memory_bytes: number;
    embedding_dims: number;
    validation_issues: number;
    concepts_with_issues: number;
    error_rate: number;
  };
  by_status: Record<string, number>;
  by_class: Record<string, number>;
  by_subject: Record<string, number>;
  jobs_total: number;
  chapters: ReportChapter[];
}

export interface SemanticRetrievalReadiness {
  status: string;
  configured: boolean;
  configured_model: string;
  configured_endpoint_host: string;
  stored_model: string;
  stored_endpoint_host: string;
  stored_dimensions: number;
}

export interface CurriculumReleaseReadiness {
  status: string;
  scope: string;
  expected: Record<string, number>;
  published: Record<string, number>;
  release: {
    provenance: string;
    digest: string;
    restored_at: string | null;
  };
}

export interface PlatformReadiness {
  status: string;
  semantic_retrieval: SemanticRetrievalReadiness;
  chemistry_release: CurriculumReleaseReadiness;
}

export interface EvidenceAgentSummary {
  agent: string;
  display_name: string;
  role: string;
  registered: boolean;
  runs: number;
  errors: number;
  last_activity: string | null;
  health: string;
  activity_state: "active" | "stale" | "not_observed";
  success_rate_percent: number | null;
  average_latency_ms: number | null;
  average_quality_score: number | null;
}

export interface AdminEvidenceOverview {
  generated_at: string;
  window_hours: number;
  agents: EvidenceAgentSummary[];
  content: {
    subject_catalogs: number;
    chapters: number;
    published_chapters: number;
    pages: number;
    subtopics: number;
    chunks: number;
    embedded_chunks: number;
    chapters_ready: number;
    source_page_coverage_percent: number;
    embedding_coverage_percent: number;
  };
  quality: {
    turns: number;
    successful_turns: number;
    average_score: number | null;
    quality_pass_rate_percent: number | null;
    retrieval_turns: number;
    grounded_turns: number;
    grounded_rate_percent: number | null;
    source_page_proof_rate_percent: number | null;
  };
  readiness: {
    release: CurriculumReleaseReadiness;
    semantic_retrieval: SemanticRetrievalReadiness;
  };
}

export interface AdminContentEvidenceChapter {
  chapter_id: number;
  board: string;
  class_level: string;
  subject: string;
  chapter_number: number | null;
  chapter_name: string;
  slug: string;
  status: string;
  version: string;
  source_integrity: {
    source_hash: string;
    published_source_hash: string;
    published_hash_matches: boolean;
  };
  published_at: string | null;
  updated_at: string | null;
  counts: { pages: number; subtopics: number; chunks: number; embedded_chunks: number };
  quality: {
    coverage_score: number;
    extraction_quality: number;
    validation_issue_count: number;
    blocking_issues: string[];
    blocking_issue_count: number;
    ready: boolean;
  };
  evidence: {
    subtopics_with_source_pages: number;
    subtopics_with_verified_source_pages: number;
    referenced_source_pages: number[];
    verified_source_pages: number[];
    missing_source_pages: number[];
    source_page_coverage_percent: number;
    embedding_coverage_percent: number;
  };
}

export interface PaginationEvidence {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
}

export interface AdminContentEvidence {
  items: AdminContentEvidenceChapter[];
  pagination: PaginationEvidence;
  filters: Record<string, string>;
}

export interface AdminSubtopicEvidence {
  id: number;
  concept_id: string;
  title: string;
  difficulty_level: number;
  importance_level: string;
  exam_weightage: string;
  blooms_taxonomy: string;
  source_proof: {
    page_numbers: number[];
    referenced_page_numbers: number[];
    verified_page_numbers: number[];
    missing_page_numbers: number[];
    reference_count: number;
    verified_reference_count: number;
    citation_count: number;
    verified: boolean;
  };
  content_checks: {
    has_definition: boolean;
    has_explanation: boolean;
    key_point_count: number;
    example_count: number;
    formula_count: number;
    learning_objective_count: number;
  };
  validation: {
    passed: boolean;
    issues: Array<{ code: string; severity: string; message: string }>;
  };
}

export interface AdminChapterEvidence {
  chapter: {
    chapter_id: number;
    board: string;
    class_level: string;
    subject: string;
    chapter_number: number | null;
    chapter_name: string;
    status: string;
    version: string;
    source_integrity: {
      source_hash: string;
      published_source_hash: string;
      published_hash_matches: boolean;
    };
    coverage_score: number;
    extraction_quality: number;
    blocking_issues: string[];
    blocking_issue_count: number;
  };
  retrieval_evidence: {
    chunk_count: number;
    embedded_chunk_count: number;
    embedding_coverage_percent: number;
    stored_embedding_dimensions: number[];
    source_page_ranges: Array<{ page_start: number; page_end: number }>;
    source_page_ranges_truncated: boolean;
  };
  subtopics: AdminSubtopicEvidence[];
  pagination: PaginationEvidence;
}

export interface AdminActivityEvidenceItem {
  trace_id: number;
  created_at: string | null;
  agent: string;
  status: string;
  latency_ms: number;
  estimated_tokens: number;
  quality: {
    score: number | null;
    passed: boolean | null;
    grounding_score: number | null;
    hallucination_risk: number | null;
    issues: string[];
  };
  grounding: {
    policy: string;
    status: string;
    source: string;
    section_id: string;
    paragraphs_found: number;
    source_pages: number[];
    citation_count: number;
    supported: boolean;
  };
  fallback_count: number;
}

export interface AdminActivityEvidence {
  items: AdminActivityEvidenceItem[];
  pagination: PaginationEvidence;
  window_hours: number;
  sample_cap: number;
  filters: Record<string, string>;
}

export interface AdminConsolePayload {
  generated_at: string;
  environment: string;
  header: {
    system_status: string;
    backend_ready: boolean;
    database_status: string;
    auth_status: string;
    llm_status: string;
    rag_status: string;
    last_sync_time: string;
  };
  overview: Record<string, ConsoleMetric>;
  agents: AgentStatus[];
  traces: AdminTrace[];
  students: StudentRow[];
  audit: AuditRow[];
  content: {
    chapters_total: number;
    approved_or_published: number;
    coverage_score_avg: number | null;
    status_counts: Record<string, number>;
    recent_jobs: ContentJob[];
  };
  data_intake?: {
    totals: {
      content_chunks: number;
      topics: number;
      input_tokens: number;
      output_tokens: number;
      estimated_cost_usd: number;
    };
    freshness: {
      traces_24h: number;
      events_24h: number;
      latest_trace_at: string | null;
      last_indexed_time: string | null;
    };
    source_coverage: Array<{ source: string; chunks: number }>;
  };
  model_registry?: {
    current: {
      llm_provider?: string;
      llm_model?: string;
      embedding_model?: string | null;
      rag_index_version?: string;
      quality_score?: number | null;
      latency_ms?: number | null;
      grounded_answer_rate?: number | null;
    };
  };
  quality: {
    avg_quality_score: number | null;
    hallucination_risk: number;
    missing_sources: number;
    failed_mcq_generation: number;
    empty_retrieval: number;
    slow_responses: number;
    fallback_used: number;
  };
  system: {
    services: Array<{ name: string; status: string }>;
  };
}
