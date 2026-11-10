import { getTkaDeviceId } from "@/lib/tkaDeviceId";

export type TkaSessionCredentials = {
  sessionId: string;
  sessionToken: string;
  startedAt: string;
};

export type TkaExamResult = {
  sessionId: string;
  score: number;
  percentage: number;
  answeredCount: number;
  durationSeconds: number;
  submittedAt: string;
  submitReason: string;
  violations: number;
  spreadsheetSaved: boolean;
  emailSent: boolean;
  spreadsheetUrl: string;
};

export type TkaViolationResponse = {
  ok: true;
  violations: number;
  autoSubmitted: boolean;
} & Partial<TkaExamResult>;

export class TkaExamApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "TkaExamApiError";
  }
}

const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyfLs6l6CzFDqnyBrg5bdtz287NXtO8XEbpROahTFix0mLx5_ubqzRe5n6Kt27oyNtR3A/exec";

const post = async <T>(body: Record<string, unknown>): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      // text/plain avoids a browser preflight for Google Apps Script Web Apps.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TkaExamApiError("Koneksi ke Google Spreadsheet gagal.");
  }

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    code?: string;
  };
  if (!response.ok || data.ok === false) {
    throw new TkaExamApiError(data.message ?? "Hasil ujian gagal dikirim ke Spreadsheet.", data.code);
  }
  return data as T;
};

const createLocalToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const requestTkaExamAccess = async (packageNumber: 1 | 2) => {
  await getTkaDeviceId();
  return { ok: true as const, preAuthToken: `local-${packageNumber}-${createLocalToken()}` };
};

export const startTkaExamSession = async (
  packageNumber: 1 | 2,
  preAuthToken: string,
  name: string,
  school: string,
) => {
  const deviceId = await getTkaDeviceId();
  return {
    sessionId: `${packageNumber}-${createLocalToken()}`,
    sessionToken: JSON.stringify({ preAuthToken, deviceId, name, school }),
    startedAt: new Date().toISOString(),
  } satisfies TkaSessionCredentials;
};

export const saveTkaExamAnswer = (
  packageNumber: 1 | 2,
  session: TkaSessionCredentials,
  questionNumber: number,
  answerIndex: number,
) =>
  post<{ ok: true }>({
    action: "answer",
    packageNumber,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    questionNumber,
    answerIndex,
  });

export const reportTkaExamViolation = (
  packageNumber: 1 | 2,
  session: TkaSessionCredentials,
  eventId: string,
) =>
  post<TkaViolationResponse>({
    action: "violation",
    packageNumber,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    eventId,
  });

export const submitTkaExamSession = (
  packageNumber: 1 | 2,
  session: TkaSessionCredentials,
  reason: "manual" | "time-up",
) =>
  post<TkaExamResult>({
    action: "submit",
    packageNumber,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    reason,
  });
