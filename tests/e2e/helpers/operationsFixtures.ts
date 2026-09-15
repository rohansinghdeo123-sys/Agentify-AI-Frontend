import type { Page, Route } from "@playwright/test";
import type {
  AdminActivityEvidence,
  AdminChapterEvidence,
  AdminContentEvidence,
  AdminContentEvidenceChapter,
  AdminEvidenceOverview,
  AdminSubtopicEvidence,
} from "../../../components/admin/types";
import type { SessionRecord } from "../../../features/learning-workspace/types";
import type { LeaderboardEntry } from "../../../features/rankings/leaderboard";
import type { RevisionQueueResponse } from "../../../lib/revision";
import { WORKSPACE_TEST_BACKEND, WORKSPACE_TEST_CATALOG, WORKSPACE_TEST_USER_ID } from "./mockWorkspace";

const DAY_MS = 86_400_000;

/** Build fresh, entirely synthetic evidence that stays inside the charts' windows. */
export function createOperationsFixtures(now = new Date()) {
  const generatedAt = now.toISOString();
  const dateAgo = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const topics = ["Chemistry foundations", "Properties of matter", "The mole concept", "Alkanes", "Alkenes", "Alkynes"];
  const sessions = Array.from({ length: 54 }, (_, index) => index)
    .filter((index) => index < 7 || index % 4 !== 3)
    .map((daysAgo, index) => {
      const topicIndex = index % topics.length;
      const correct = [9, 8, 7, 9, 6, 4][topicIndex] + (index % 3 === 0 ? 1 : 0);
      return {
        id: `operations-session-${index + 1}`,
        subject: "Chemistry",
        class_level: "Class 11",
        topic: topics[topicIndex],
        duration: 18 + (index % 5) * 4,
        questions: 10,
        correct,
        xp: correct * 10,
        focusScore: 72 + (index % 6) * 4,
        timestamp: dateAgo(daysAgo),
        completedAt: dateAgo(daysAgo),
        status: "completed",
        performance: correct * 10,
      };
    });
  const totalQuestions = sessions.reduce((sum, session) => sum + session.questions, 0);
  const totalCorrect = sessions.reduce((sum, session) => sum + session.correct, 0);
  const xp = sessions.reduce((sum, session) => sum + session.xp, 0);
  const progress = {
    user_id: WORKSPACE_TEST_USER_ID,
    total_tests: sessions.length,
    total_questions: totalQuestions,
    total_correct: totalCorrect,
    xp,
    streak: 7,
    level: Math.floor(xp / 100) + 1,
    accuracy: Math.round(totalCorrect / totalQuestions * 100),
    focus_score: Math.round(sessions.reduce((sum, session) => sum + session.focusScore, 0) / sessions.length),
    consistency_index: 82,
    learning_efficiency: 76,
  };
  const sessionRecords: SessionRecord[] = sessions.map((session) => ({
    id: session.id,
    subject: session.subject,
    class_level: session.class_level,
    topic: session.topic,
    total_questions: session.questions,
    score: session.correct,
    xp_earned: session.xp,
    time_spent_seconds: session.duration * 60,
    session_type: "exam",
    completed_at: session.completedAt,
  }));
  const leaderboard: LeaderboardEntry[] = [
    { user_id: "operations-learner-1", display_name: "Ishita Rao", xp: xp + 1240, streak: 21, total_tests: 68 },
    { user_id: "operations-learner-2", display_name: "Kabir Mehta", xp: xp + 880, streak: 14, total_tests: 61 },
    { user_id: "operations-learner-3", display_name: "Ananya Sen", xp: xp + 190, streak: 9, total_tests: 47 },
    { user_id: WORKSPACE_TEST_USER_ID, display_name: "Aarav Sharma", xp, streak: progress.streak, total_tests: progress.total_tests },
    { user_id: "operations-learner-5", display_name: "Dev Patel", xp: xp - 170, streak: 6, total_tests: 42 },
    { user_id: "operations-learner-6", display_name: "Zoya Khan", xp: 820, streak: 5, total_tests: 18 },
    { user_id: "operations-learner-7", display_name: "Riya Das", xp: 420, streak: 3, total_tests: 10 },
    { user_id: "operations-learner-8", display_name: "Arjun Nair", xp: 170, streak: 2, total_tests: 4 },
  ].map((entry, index) => ({ ...entry, rank: index + 1, class_rank: index + 1, class_level: "Class 11" }));

  const weekSessions = sessions.slice(0, 7);
  const dailyXp = weekSessions.map((session) => session.xp).reverse();
  const weekXp = dailyXp.reduce((sum, value) => sum + value, 0);
  const rivalDailyXp = dailyXp.map((value, index) => value + (index < 3 ? 10 : 0));
  const challenge = {
    week: { start_utc: dateAgo(6), end_utc: dateAgo(-1), seconds_remaining: 86_400 },
    me: {
      name: "Aarav Sharma", class_level: "Class 11", week_xp: weekXp,
      sessions: weekSessions.length, accuracy: Math.round(weekXp / 7),
      study_minutes: weekSessions.reduce((sum, session) => sum + session.duration, 0),
      active_days: 7, daily_xp: dailyXp,
    },
    rival: {
      name: "Ananya Sen", class_level: "Class 11", week_xp: weekXp + 30,
      sessions: 8, accuracy: 81, study_minutes: 198, active_days: 7, daily_xp: rivalDailyXp,
      activity: [
        { type: "Exam practice", topic: "Alkenes", xp_earned: rivalDailyXp[6], completed_at: generatedAt },
        { type: "Focused revision", topic: "The mole concept", xp_earned: rivalDailyXp[5], completed_at: dateAgo(1) },
        { type: "Study session", topic: "Properties of matter", xp_earned: rivalDailyXp[4], completed_at: dateAgo(2) },
      ],
    },
    battle: { status: "trailing", my_week_xp: weekXp, rival_week_xp: weekXp + 30, xp_gap: 30 },
    missions: [
      { id: "daily-consistency", title: "Build a five-day streak", detail: "Study on five different days this week.", target: 5, progress: 7, completed: true },
      { id: "practice-eight", title: "Complete eight focused sessions", detail: "One more practice session keeps your momentum growing.", target: 8, progress: 7, completed: false },
      { id: "weekly-xp", title: "Earn 800 weekly XP", detail: "Use revision and practice to close the gap.", target: 800, progress: weekXp, completed: false },
    ],
    reward: { win_xp: 150, badge: "Weekly Champion" },
    last_week: { outcome: "won", reward_xp: 150, rival_name: "Dev Patel" },
  };
  const revisionEntries: RevisionQueueResponse["queue"] = [
    { topic: "alkynes", bucket: "overdue", priority: 94, retention_estimate: 0.42, days_since_practiced: 5, accuracy: 46, attempts: 7, weak: true, declining: true, suggested_mode: "flashcards", suggested_minutes: 12, reason: "Revisit triple-bond reactions before your next timed practice." },
    { topic: "alkenes", bucket: "due", priority: 78, retention_estimate: 0.64, days_since_practiced: 4, accuracy: 64, attempts: 7, weak: false, declining: false, suggested_mode: "quiz", suggested_minutes: 10, reason: "A short recall session will strengthen addition-reaction patterns." },
    { topic: "properties_of_matter", bucket: "strengthen", priority: 62, retention_estimate: 0.8, days_since_practiced: 1, accuracy: 82, attempts: 7, weak: false, declining: false, suggested_mode: "quiz", suggested_minutes: 8, reason: "Keep physical and chemical properties easy to distinguish." },
  ];
  const revisionQueue: RevisionQueueResponse = {
    user_id: WORKSPACE_TEST_USER_ID, generated_at: generatedAt,
    summary: { overdue: 1, due: 1, strengthen: 1, fresh: 0, top_pick: revisionEntries[0], message: "Three focused reviews are ready for today." },
    queue: revisionEntries,
  };

  const chapterDetails: Record<number, AdminChapterEvidence> = {};
  const chapters: AdminContentEvidenceChapter[] = WORKSPACE_TEST_CATALOG.subjects[0].chapters.map((chapter, chapterIndex) => {
    const chapterId = chapterIndex + 101;
    const firstPage = chapterIndex === 0 ? 1 : 35;
    const pages = Array.from({ length: 9 }, (_, index) => firstPage + index);
    const sourceHash = `${chapterId.toString(16).padStart(8, "0")}${"abcdef0123456789".repeat(3)}12345678`;
    const subtopics: AdminSubtopicEvidence[] = chapter.topics.map((topic, index) => {
      const sourcePages = pages.slice(index * 3, index * 3 + 3);
      return {
        id: chapterId * 10 + index, concept_id: topic.id, title: topic.label,
        difficulty_level: index + 2, importance_level: "high", exam_weightage: "high", blooms_taxonomy: "understand",
        source_proof: {
          page_numbers: sourcePages, referenced_page_numbers: sourcePages, verified_page_numbers: sourcePages,
          missing_page_numbers: [], reference_count: 3, verified_reference_count: 3, citation_count: 3, verified: true,
        },
        content_checks: { has_definition: true, has_explanation: true, key_point_count: 5, example_count: 3, formula_count: index + 1, learning_objective_count: 2 },
        validation: { passed: true, issues: [] },
      };
    });
    const item: AdminContentEvidenceChapter = {
      chapter_id: chapterId, board: "CBSE", class_level: "11", subject: "Chemistry",
      chapter_number: chapterIndex === 0 ? 1 : 9, chapter_name: chapter.name, slug: chapter.slug,
      status: "published", version: "synthetic-2026.09",
      source_integrity: { source_hash: sourceHash, published_source_hash: sourceHash, published_hash_matches: true },
      published_at: dateAgo(4), updated_at: dateAgo(1),
      counts: { pages: 9, subtopics: subtopics.length, chunks: 24, embedded_chunks: 24 },
      quality: { coverage_score: 1, extraction_quality: 0.98, validation_issue_count: 0, blocking_issues: [], blocking_issue_count: 0, ready: true },
      evidence: {
        subtopics_with_source_pages: subtopics.length, subtopics_with_verified_source_pages: subtopics.length,
        referenced_source_pages: pages, verified_source_pages: pages, missing_source_pages: [],
        source_page_coverage_percent: 100, embedding_coverage_percent: 100,
      },
    };
    chapterDetails[chapterId] = {
      chapter: {
        chapter_id: item.chapter_id, board: item.board, class_level: item.class_level, subject: item.subject,
        chapter_number: item.chapter_number, chapter_name: item.chapter_name, status: item.status,
        version: item.version, source_integrity: item.source_integrity,
        coverage_score: item.quality.coverage_score, extraction_quality: item.quality.extraction_quality,
        blocking_issues: [], blocking_issue_count: 0,
      },
      retrieval_evidence: {
        chunk_count: 24, embedded_chunk_count: 24, embedding_coverage_percent: 100,
        stored_embedding_dimensions: [1536], source_page_ranges: [{ page_start: firstPage, page_end: firstPage + 8 }],
        source_page_ranges_truncated: false,
      },
      subtopics, pagination: { limit: 100, offset: 0, total: subtopics.length, has_more: false },
    };
    return item;
  });
  const content: AdminContentEvidence = {
    items: chapters, pagination: { limit: 100, offset: 0, total: chapters.length, has_more: false }, filters: {},
  };
  const agents: AdminEvidenceOverview["agents"] = [
    { agent: "study_coach", display_name: "Study Coach", role: "Guided explanations and learner questions", runs: 128, errors: 0, average_latency_ms: 920, average_quality_score: 0.96 },
    { agent: "revision_agent", display_name: "Revision Agent", role: "Recall practice and retention planning", runs: 74, errors: 0, average_latency_ms: 680, average_quality_score: 0.94 },
    { agent: "exam_agent", display_name: "Exam Agent", role: "Grounded assessment and feedback", runs: 56, errors: 0, average_latency_ms: 1180, average_quality_score: 0.97 },
    { agent: "planning_agent", display_name: "Planning Agent", role: "Adaptive schedules and weekly reviews", runs: 32, errors: 0, average_latency_ms: 750, average_quality_score: 0.95 },
  ].map((agent) => ({ ...agent, registered: true, last_activity: generatedAt, health: "healthy", activity_state: "active", success_rate_percent: 100 }));
  const overview: AdminEvidenceOverview = {
    generated_at: generatedAt, window_hours: 24, agents,
    content: { subject_catalogs: 1, chapters: 2, published_chapters: 2, pages: 18, subtopics: 6, chunks: 48, embedded_chunks: 48, chapters_ready: 2, source_page_coverage_percent: 100, embedding_coverage_percent: 100 },
    quality: { turns: 290, successful_turns: 290, average_score: 0.955, quality_pass_rate_percent: 100, retrieval_turns: 258, grounded_turns: 258, grounded_rate_percent: 100, source_page_proof_rate_percent: 100 },
    readiness: {
      release: {
        status: "ready", scope: "Synthetic Class 11 Chemistry catalog",
        expected: { chapters: 2, subtopics: 6, chunks: 48 }, published: { chapters: 2, subtopics: 6, chunks: 48 },
        release: { provenance: "verified_release", digest: "synthetic-chemistry-release-2026-09", restored_at: dateAgo(4) },
      },
      semantic_retrieval: { status: "ready", configured: true, configured_model: "fixture-embedding-model", configured_endpoint_host: "embeddings.example.test", stored_model: "fixture-embedding-model", stored_endpoint_host: "embeddings.example.test", stored_dimensions: 1536 },
    },
  };
  const activity: AdminActivityEvidence = {
    items: agents.slice(0, 3).map((agent, index) => ({
      trace_id: index + 501, created_at: new Date(now.getTime() - index * 180_000).toISOString(), agent: agent.agent,
      status: "success", latency_ms: agent.average_latency_ms!, estimated_tokens: 1250 + index * 240,
      quality: { score: agent.average_quality_score, passed: true, grounding_score: 0.98, hallucination_risk: 0.01, issues: [] },
      grounding: { policy: "source_required", status: "grounded", source: "published_curriculum", section_id: "chemistry-foundations", paragraphs_found: 4, source_pages: [1, 2, 3], citation_count: 3, supported: true },
      fallback_count: 0,
    })),
    pagination: { limit: 50, offset: 0, total: 3, has_more: false }, window_hours: 24, sample_cap: 50, filters: {},
  };

  return { dashboard: { sessions, progress }, sessionRecords, leaderboard: { leaderboard }, challenge, revisionQueue, overview, content, activity, chapterDetails };
}

/**
 * Call after installWorkspaceMocks(page, theme, { state: "ready", founder: true })
 * and before navigating to Admin, Analytics or Rankings. Founder is needed only
 * for Admin. This layers exact GET fixtures over the strict workspace fallback;
 * unknown requests remain visible in its unhandledRequests array. Reports export
 * these payloads as JSON/CSV in the browser, so no fictitious report API is added.
 */
export async function installOperationsMocks(page: Page, options: { now?: Date } = {}) {
  const fixtures = createOperationsFixtures(options.now);
  const handledRequests: string[] = [];
  const responses: Record<string, unknown> = {
    [`/dashboard/${WORKSPACE_TEST_USER_ID}`]: fixtures.dashboard,
    [`/sessions/${WORKSPACE_TEST_USER_ID}`]: { sessions: fixtures.sessionRecords },
    "/leaderboard": fixtures.leaderboard,
    [`/rivals/weekly-challenge/${WORKSPACE_TEST_USER_ID}`]: fixtures.challenge,
    [`/revision/queue/${WORKSPACE_TEST_USER_ID}`]: fixtures.revisionQueue,
    "/admin/evidence/overview": fixtures.overview,
    "/admin/evidence/content": fixtures.content,
    "/admin/evidence/activity": fixtures.activity,
    ...Object.fromEntries(Object.entries(fixtures.chapterDetails).map(([id, detail]) => [`/admin/evidence/content/${id}`, detail])),
  };
  await page.route(`${WORKSPACE_TEST_BACKEND}/**`, async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() !== "GET" || !Object.hasOwn(responses, pathname)) return route.fallback();
    handledRequests.push(`GET ${pathname}`);
    return route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type" },
      body: JSON.stringify(responses[pathname]),
    });
  });
  return { fixtures, handledRequests };
}
