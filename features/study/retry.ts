import type { CoachMessage, PendingAttachment } from "./types";

export type StudyTutorRequestSnapshot = {
  prompt: string;
  attachments: PendingAttachment[];
  strictAttachmentGrounding: boolean;
  directAnswer: boolean;
  socraticMode: boolean;
  fromVoice: boolean;
};

export function createStudyTutorRequestSnapshot({
  prompt,
  attachments,
  strictAttachmentGrounding,
  directAnswer,
  socraticMode,
  fromVoice,
}: StudyTutorRequestSnapshot): StudyTutorRequestSnapshot {
  return {
    prompt: prompt.trim(),
    attachments: attachments.map((attachment) => ({ ...attachment })),
    strictAttachmentGrounding,
    directAnswer,
    socraticMode,
    fromVoice,
  };
}

export function historyBeforeRetriedStudyTurn(messages: CoachMessage[]) {
  const history = [...messages];
  if (history.at(-1)?.role === "coach") history.pop();
  if (history.at(-1)?.role === "user") history.pop();
  return history;
}

export function appendPendingStudyTurn(
  messages: CoachMessage[],
  request: StudyTutorRequestSnapshot,
  timestamp: string,
  replaceLastTurn = false,
): CoachMessage[] {
  const history = replaceLastTurn ? historyBeforeRetriedStudyTurn(messages) : messages;
  return [
    ...history,
    {
      role: "user",
      content: request.prompt,
      timestamp,
      attachments: request.attachments.map((attachment) => ({ ...attachment })),
    },
    { role: "coach", content: "", timestamp: "" },
  ];
}
