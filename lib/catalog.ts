"use client";

/**
 * Shared course catalog for Study Lab, Exam Mode, and Missions.
 *
 * Chapters come from the backend `GET /catalog` (admin-published content).
 * The built-in list renders instantly and remains the safety net when the
 * request fails or nothing is published yet - a student never sees empty
 * chapter selectors. This module is the ONLY place the frontend defines
 * course structure; pages must not hard-code chapter lists.
 */

import { useAuth } from "@/context/AuthContext";
import { apiJson } from "@/lib/apiClient";
import { useEffect, useState } from "react";

export type CatalogTopic = { label: string; value: string; memberIds?: string[] };
export type CatalogChapter = {
  label: string;
  value: string;
  topics: CatalogTopic[];
  subject?: string;
  classLevel?: string;
};

export const BUILTIN_CHAPTERS: CatalogChapter[] = [
  {
    label: "Hydrocarbons",
    value: "hydrocarbon",
    subject: "Chemistry",
    topics: [
      { label: "Alkanes", value: "alkanes" },
      { label: "Alkenes", value: "alkenes" },
      { label: "Alkynes", value: "alkynes" },
      { label: "Aromatic Hydrocarbons", value: "aromatics" },
    ],
  },
  {
    label: "Basic Concepts of Chemistry",
    value: "matter",
    subject: "Chemistry",
    topics: [
      { label: "Definition of Chemistry", value: "chemistry_definition" },
      { label: "Alchemy and Iatrochemistry", value: "historical_alchemy" },
      { label: "Ancient Indian Chemistry", value: "ancient_indian_chemistry" },
      { label: "Role and Importance of Chemistry", value: "importance_of_chemistry" },
      { label: "Matter Definition", value: "matter_definition" },
      { label: "Properties of Matter", value: "properties_of_matter" },
      { label: "States of Matter", value: "states_of_matter" },
      { label: "Solid State", value: "solid_state" },
      { label: "Liquid State", value: "liquid_state" },
      { label: "Gaseous State", value: "gaseous_state" },
      { label: "Interconversion of States", value: "interconversion_of_states" },
      { label: "Classification of Matter", value: "classification_of_matter" },
    ],
  },
];

function normalizeCatalogKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Resolve current unit IDs plus legacy member IDs/titles from saved links. */
export function findCatalogTopic(chapter: CatalogChapter | undefined, rawTopic: string) {
  const requested = normalizeCatalogKey(rawTopic);
  if (!chapter || !requested) return undefined;
  return chapter.topics.find((topic) => (
    normalizeCatalogKey(topic.value) === requested
    || normalizeCatalogKey(topic.label) === requested
    || topic.memberIds?.some((memberId) => normalizeCatalogKey(memberId) === requested)
  ));
}

export function findChapterForTopic(chapters: CatalogChapter[], topicValue: string): string {
  return (
    chapters.find((chapter) => findCatalogTopic(chapter, topicValue))?.value || ""
  );
}

/** Correct a (chapter, topic) pair against the active catalog. */
export function reconcileSelection(
  chapters: CatalogChapter[],
  chapterValue: string,
  topicValue: string,
): { chapter: string; topic: string; changed: boolean } {
  const fallback = chapters[0];
  const chapter = chapters.find((item) => item.value === chapterValue) || fallback;
  if (!chapter) return { chapter: chapterValue, topic: topicValue, changed: false };
  const topic = findCatalogTopic(chapter, topicValue) || chapter.topics[0];
  const next = { chapter: chapter.value, topic: topic?.value || "" };
  return { ...next, changed: next.chapter !== chapterValue || next.topic !== topicValue };
}

type BackendCatalog = {
  source?: string;
  subjects?: Array<{
    subject?: string;
    class_level?: string;
    chapters?: Array<{
      slug?: string;
      name?: string;
      topics?: Array<{ id?: string; label?: string; concept_ids?: string[] }>;
    }>;
  }>;
};

function normalizeClassLevel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^class_/, "")
    .replace(/^_+|_+$/g, "");
}

export function catalogCacheKey(userId: string, classLevel: string) {
  return `catalog:v2:${encodeURIComponent(userId)}:${normalizeClassLevel(classLevel) || "unspecified"}`;
}

function mapBackendCatalog(payload: BackendCatalog, preferredClassLevel: string): CatalogChapter[] {
  const subjects = Array.isArray(payload?.subjects) ? payload.subjects : [];
  if (!subjects.length) return [];
  const normalizedPreferredClass = normalizeClassLevel(preferredClassLevel);
  const preferred =
    subjects.find(
      (group) => group.class_level && normalizeClassLevel(group.class_level) === normalizedPreferredClass,
    ) ||
    subjects[0];
  const subject = String(preferred.subject || "");
  const classLevel = String(preferred.class_level || preferredClassLevel || "");
  const chapters = (preferred.chapters || [])
    .map((chapter) => ({
      label: String(chapter.name || chapter.slug || ""),
      value: String(chapter.slug || ""),
      subject,
      classLevel,
      topics: (chapter.topics || [])
        .map((topic) => ({
          label: String(topic.label || topic.id || ""),
          value: String(topic.id || ""),
          memberIds: Array.isArray(topic.concept_ids)
            ? topic.concept_ids.map((value) => String(value)).filter(Boolean)
            : undefined,
        }))
        .filter((topic) => topic.value),
    }))
    .filter((chapter) => chapter.value && chapter.topics.length);
  return chapters;
}

export function useCatalog(): {
  chapters: CatalogChapter[];
  source: "builtin" | "published";
  settled: boolean;
} {
  const { userId, loading, getAuthHeaders, profile } = useAuth();
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  const [chapters, setChapters] = useState<CatalogChapter[]>(BUILTIN_CHAPTERS);
  const [source, setSource] = useState<"builtin" | "published">("builtin");
  const [settled, setSettled] = useState(false);
  const classLevel = profile?.classLevel || "";

  useEffect(() => {
    if (loading) return;
    let active = true;

    async function loadCatalog() {
      await Promise.resolve();
      if (!active) return;
      setSettled(false);
      setChapters(BUILTIN_CHAPTERS);
      setSource("builtin");
      if (!userId) {
        setSettled(true);
        return;
      }
      try {
        const payload = await apiJson<BackendCatalog>(`${backendURL}/catalog`, {
          headers: await getAuthHeaders(),
          cacheKey: catalogCacheKey(userId, classLevel),
          cacheTtlMs: 300000,
          retries: 1,
          timeoutMs: 8000,
        });
        if (!active || payload?.source !== "published") return;
        const mapped = mapBackendCatalog(payload, classLevel);
        if (mapped.length) {
          setChapters(mapped);
          setSource("published");
        }
      } catch {
        // Built-in catalog keeps every selector working.
      } finally {
        if (active) setSettled(true);
      }
    }

    void loadCatalog();
    return () => {
      active = false;
    };
  }, [backendURL, classLevel, getAuthHeaders, loading, userId]);

  return { chapters, source, settled };
}
