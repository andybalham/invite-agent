export const PARTICIPANT_NAME_MAX_CODE_POINTS = 100;

export type ParticipantNameValidation =
  | { readonly success: true; readonly displayName: string; readonly normalizedName: string }
  | { readonly success: false; readonly message: string };

const CASE_FOLD_EXPANSIONS: Readonly<Record<string, string>> = Object.freeze({
  "ß": "ss",
  "ς": "σ",
  "ſ": "s"
});

export function normalizeParticipantName(value: string): string {
  return Array.from(value.trim().normalize("NFKC").toLowerCase())
    .map((character) => CASE_FOLD_EXPANSIONS[character] ?? character)
    .join("");
}

export function validateParticipantName(input: unknown): ParticipantNameValidation {
  if (typeof input !== "string") {
    return { success: false, message: "Enter a display name." };
  }
  const displayName = input.trim();
  if (displayName.length === 0) {
    return { success: false, message: "Enter a display name." };
  }
  if (Array.from(displayName).length > PARTICIPANT_NAME_MAX_CODE_POINTS) {
    return {
      success: false,
      message: `Enter a display name using ${PARTICIPANT_NAME_MAX_CODE_POINTS} characters or fewer.`
    };
  }
  if (/\p{Cc}/u.test(displayName)) {
    return { success: false, message: "Display names cannot contain control characters." };
  }
  return { success: true, displayName, normalizedName: normalizeParticipantName(displayName) };
}
