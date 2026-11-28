export function journeySessionKeys(userId: string | null | undefined) {
  const learner = userId || "learner";
  return {
    intro: `agentify-atlas-intro:${learner}`,
    return: `agentify-atlas-return:${learner}`,
  };
}

export function prepareJourneyAfterSignIn(userId: string) {
  const keys = journeySessionKeys(userId);
  try {
    sessionStorage.removeItem(keys.intro);
    sessionStorage.removeItem(keys.return);
  } catch {
    // Browsers can restrict storage. The Atlas plays without a saved marker.
  }
}
