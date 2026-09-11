type OtpInputChange = {
  inputType?: string;
  data?: string | null;
};

export function readOtpInputDigits(raw: string, change: OtpInputChange): string | null {
  // A typed digit replaces this slot, even if the caret appended it to an old digit.
  // Paste and SMS autofill still provide their complete value for distribution.
  if (change.inputType === "insertText" && change.data?.length === 1) {
    return /^\d$/.test(change.data) ? change.data : null;
  }

  return raw.replace(/\D/g, "");
}
