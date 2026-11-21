"use client";

import { AppIcon, type AppIconName } from "@/components/ui/Polished";
import { handleTabListKeyDown } from "@/components/ui/primitives";
import { artifactHasContent } from "@/features/revision/api";
import type {
  ArtifactType,
  StudyArtifact,
  StudyArtifactResponse,
} from "@/features/study/types";
import { useMemo, useState } from "react";
import styles from "./revision-artifacts.module.css";

const TOOL_TABS: Array<{
  id: ArtifactType;
  label: string;
  shortLabel: string;
  description: string;
  icon: AppIconName;
}> = [
  { id: "concept_map", label: "Concept Map", shortLabel: "Map", description: "See how the ideas connect.", icon: "study" },
  { id: "flip_cards", label: "Recall Cards", shortLabel: "Cards", description: "Retrieve the answer before revealing it.", icon: "copy" },
  { id: "formula_lab", label: "Formula Lab", shortLabel: "Formulas", description: "Review relationships, variables, and hints.", icon: "analytics" },
  { id: "mistake_cards", label: "Mistake Shield", shortLabel: "Mistakes", description: "Correct the traps that cost marks.", icon: "check" },
];

function cleanText(value?: string) {
  return String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function ConceptMap({ artifact }: { artifact: StudyArtifact }) {
  const nodes = artifact.nodes || [];
  const core = nodes.find((node) => node.kind === "core") || nodes[0];
  const related = nodes.filter((node) => node.id !== core?.id);
  const edges = artifact.edges || [];
  const nodeLabels = new Map(nodes.map((node) => [node.id, cleanText(node.label)]));

  if (!core) return <ToolEmpty message={artifact.empty_note || "Concept links are not available for this topic yet."} />;

  return (
    <div className={styles.mapLayout}>
      <article className={styles.coreNode}>
        <span>Core idea</span>
        <h4>{cleanText(core.label)}</h4>
        {core.description ? <p>{cleanText(core.description)}</p> : null}
      </article>

      <div className={styles.nodeGrid}>
        {related.map((node, index) => (
          <article key={node.id || `${node.label}-${index}`} className={styles.mapNode} data-kind={node.kind || "related"}>
            <div><span>{cleanText(node.kind || "connection")}</span><small>{String(index + 1).padStart(2, "0")}</small></div>
            <h4>{cleanText(node.label)}</h4>
            {node.description ? <p>{cleanText(node.description)}</p> : null}
          </article>
        ))}
      </div>

      {edges.length ? (
        <div className={styles.connectionStrip} aria-label="Concept relationships">
          {edges.slice(0, 6).map((edge, index) => (
            <span key={`${edge.from}-${edge.to}-${index}`}>
              {nodeLabels.get(edge.from) || cleanText(edge.from)} → {cleanText(edge.label || "connects")} → {nodeLabels.get(edge.to) || cleanText(edge.to)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecallCards({ artifact }: { artifact: StudyArtifact }) {
  const cards = artifact.cards || [];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<Record<number, "again" | "got_it">>({});
  const card = cards[index];
  const completed = Object.keys(ratings).length;
  const gotIt = Object.values(ratings).filter((rating) => rating === "got_it").length;

  if (!cards.length) return <ToolEmpty message={artifact.empty_note || "Recall cards are not available for this topic yet."} />;

  const rate = (rating: "again" | "got_it") => {
    setRatings((current) => ({ ...current, [index]: rating }));
    if (index < cards.length - 1) {
      setIndex((current) => current + 1);
      setRevealed(false);
    }
  };

  const restart = () => {
    setIndex(0);
    setRevealed(false);
    setRatings({});
  };

  return (
    <div className={styles.cardDeck}>
      <div className={styles.toolProgress}>
        <div><span>Recall deck</span><strong>{completed}/{cards.length} checked</strong></div>
        <span className={styles.toolProgressTrack} aria-hidden="true"><span style={{ width: `${Math.round((completed / cards.length) * 100)}%` }} /></span>
      </div>

      {completed === cards.length ? (
        <div className={styles.deckResult} role="status">
          <span><AppIcon name="check" /></span>
          <p>Deck complete</p>
          <h4>{gotIt} of {cards.length} felt clear</h4>
          <p>Cards marked “Not yet” are learning signals, not failures. Revisit the explanation and try once more.</p>
          <button type="button" onClick={restart}><AppIcon name="history" /> Run the deck again</button>
        </div>
      ) : (
        <article className={styles.recallCard} aria-live="polite">
          <div className={styles.cardTopline}>
            <span>{cleanText(card.tag || "active recall")}</span>
            <small>{index + 1} / {cards.length}</small>
          </div>
          <p className={styles.cardQuestion}>{cleanText(card.front)}</p>
          <div className={styles.cardAnswer} data-revealed={revealed ? "true" : "false"}>
            <span>{revealed ? "Answer" : "Think before you reveal"}</span>
            <p key={revealed ? "answer" : "prompt"} className={revealed ? "journey-reveal" : undefined}>
              {revealed ? cleanText(card.back) : "Say the answer aloud or write it down first."}
            </p>
          </div>
          {!revealed ? (
            <button type="button" className={styles.revealButton} onClick={() => setRevealed(true)}>Reveal answer</button>
          ) : (
            <div className={styles.ratingActions} role="group" aria-label="Rate your recall">
              <button type="button" onClick={() => rate("again")}>Not yet</button>
              <button type="button" onClick={() => rate("got_it")}><AppIcon name="check" /> Got it</button>
            </div>
          )}
        </article>
      )}
    </div>
  );
}

function FormulaLab({ artifact }: { artifact: StudyArtifact }) {
  const formulas = artifact.formulas || [];
  if (!formulas.length) return <ToolEmpty message={artifact.empty_note || "This topic does not require a formula lab."} />;

  return (
    <div className={styles.formulaGrid}>
      {formulas.map((formula, index) => (
        <article key={`${formula.formula}-${index}`} className={styles.formulaCard}>
          <div className={styles.cardTopline}>
            <span>{cleanText(formula.label || "Key relationship")}</span>
            <small>{String(index + 1).padStart(2, "0")}</small>
          </div>
          <p className={styles.formulaExpression}>{formula.formula}</p>
          {formula.variables?.length ? (
            <div className={styles.variableList} aria-label="Formula variables">
              {formula.variables.map((variable) => <span key={variable}>{cleanText(variable)}</span>)}
            </div>
          ) : null}
          {formula.hint ? <p className={styles.formulaHint}><AppIcon name="spark" /> {cleanText(formula.hint)}</p> : null}
        </article>
      ))}
    </div>
  );
}

function MistakeShield({ artifact }: { artifact: StudyArtifact }) {
  const mistakes = artifact.mistakes || [];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = mistakes[index];

  if (!mistakes.length) return <ToolEmpty message={artifact.empty_note || "Common mistake checks are not available for this topic yet."} />;

  return (
    <div className={styles.mistakeWorkspace}>
      <div className={styles.mistakeCounter}>
        <span>Mistake {index + 1} of {mistakes.length}</span>
        <div>{mistakes.map((_, itemIndex) => <span key={itemIndex} data-active={itemIndex === index ? "true" : "false"} />)}</div>
      </div>
      <article className={styles.mistakeCard} aria-live="polite">
        <div className={styles.cardTopline}>
          <span>Spot the trap</span>
          {item.frequency ? <small>{cleanText(item.frequency)}</small> : null}
        </div>
        <p className={styles.mistakeStatement}>{cleanText(item.mistake)}</p>
        {!revealed ? (
          <div className={styles.correctionPrompt}>
            <span>Pause and correct this statement in your own words.</span>
            <button type="button" onClick={() => setRevealed(true)}>Show correction</button>
          </div>
        ) : (
          <div className={styles.correction}>
            <span><AppIcon name="check" /> Correct idea</span>
            <p>{cleanText(item.correction)}</p>
            <button
              type="button"
              onClick={() => {
                setIndex((current) => (current + 1) % mistakes.length);
                setRevealed(false);
              }}
            >
              {index === mistakes.length - 1 ? "Start again" : "Next mistake"}
              <AppIcon name="arrowRight" />
            </button>
          </div>
        )}
      </article>
    </div>
  );
}

function ToolEmpty({ message }: { message: string }) {
  return (
    <div className={styles.emptyTool}>
      <AppIcon name="book" />
      <p>{message}</p>
    </div>
  );
}

export default function RevisionArtifactWorkspace({ response }: { response: StudyArtifactResponse }) {
  const available = useMemo(
    () => TOOL_TABS.filter((tab) => artifactHasContent(response.artifacts.find((artifact) => artifact.type === tab.id))),
    [response],
  );
  const [activeType, setActiveType] = useState<ArtifactType>(available[0]?.id || "flip_cards");

  const activeTab = available.find((tab) => tab.id === activeType) || available[0];
  const activeArtifact = response.artifacts.find((candidate) => candidate.type === activeTab?.id && artifactHasContent(candidate));

  if (!activeTab || !activeArtifact) return <ToolEmpty message="Study tools could not be prepared for this topic." />;

  return (
    <div className={styles.workspace}>
      <aside className={styles.brief}>
        <span className={styles.briefIcon}><AppIcon name="spark" /></span>
        <p>{cleanText(response.source || "selected material")}</p>
        <h2>{cleanText(response.title || activeArtifact.title)}</h2>
        <span>{response.student_goal || "Use active retrieval to strengthen this topic before your next exam."}</span>
        <div className={styles.signalList}>
          <span><AppIcon name="check" /> {available.length} focused tools ready</span>
          <span><AppIcon name="book" /> Built from selected study material</span>
        </div>
      </aside>

      <div className={styles.toolArea}>
        <div className={styles.tabs} role="tablist" aria-label="Study tools" onKeyDown={handleTabListKeyDown}>
          {available.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`revision-tool-tab-${tab.id}`}
              aria-selected={activeTab.id === tab.id}
              aria-controls={`revision-tool-panel-${tab.id}`}
              tabIndex={activeTab.id === tab.id ? 0 : -1}
              onClick={() => setActiveType(tab.id)}
              className={styles.tab}
              data-active={activeTab.id === tab.id ? "true" : "false"}
            >
              <AppIcon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {available.map((tab) => {
          const artifact = response.artifacts.find((candidate) => candidate.type === tab.id && artifactHasContent(candidate));
          if (!artifact) return null;
          const active = activeTab.id === tab.id;
          return (
            <section
              key={tab.id}
              id={`revision-tool-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`revision-tool-tab-${tab.id}`}
              className={styles.stage}
              hidden={!active}
            >
              <header className={styles.stageHeader}>
                <div>
                  <p>{tab.shortLabel} workspace</p>
                  <h3>{cleanText(artifact.title || tab.label)}</h3>
                  <span>{artifact.subtitle || tab.description}</span>
                </div>
                <span className={styles.stageIcon}><AppIcon name={tab.icon} /></span>
              </header>

              <div className={styles.stageBody}>
                {artifact.type === "concept_map" ? <ConceptMap artifact={artifact} /> : null}
                {artifact.type === "flip_cards" ? <RecallCards artifact={artifact} /> : null}
                {artifact.type === "formula_lab" ? <FormulaLab artifact={artifact} /> : null}
                {artifact.type === "mistake_cards" ? <MistakeShield artifact={artifact} /> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
