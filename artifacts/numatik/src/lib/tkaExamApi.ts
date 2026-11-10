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

const post = async <T>(url: string, body: Record<string, unknown>): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TkaExamApiError("Koneksi ke server ujian gagal.");
  }

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new TkaExamApiError(data.message ?? "Permintaan ke server ujian gagal.", data.code);
  }
  return data as T;
};

export const requestTkaExamAccess = async (packageNumber: 1 | 2) => {
  const deviceId = await getTkaDeviceId();
  return post<{ ok: true; preAuthToken: string }>(
    `/api/tka/tryout/${packageNumber}/access`,
    { deviceId },
  );
};

export const startTkaExamSession = async (
  packageNumber: 1 | 2,
  preAuthToken: string,
  name: string,
  school: string,
) => {
  const deviceId = await getTkaDeviceId();
  return post<TkaSessionCredentials>(
    `/api/tka/tryout/${packageNumber}/session/start`,
    { preAuthToken, name, school, deviceId },
  );
};

export const saveTkaExamAnswer = (
  packageNumber: 1 | 2,
  session: TkaSessionCredentials,
  questionNumber: number,
  answerIndex: number,
) =>
  post<{ ok: true }>(
    `/api/tka/tryout/${packageNumber}/session/${session.sessionId}/answer`,
    {
      sessionToken: session.sessionToken,
      questionNumber,
      answerIndex,
    },
  );

export const reportTkaExamViolation = (
  packageNumber: 1 | 2,
  session: TkaSessionCredentials,
  eventId: string,
) =>
  post<TkaViolationResponse>(
    `/api/tka/tryout/${packageNumber}/session/${session.sessionId}/violation`,
    { sessionToken: session.sessionToken, eventId },
  );

export const submitTkaExamSession = (
  packageNumber: 1 | 2,
  session: TkaSessionCredentials,
  reason: "manual" | "time-up",
) =>
  post<TkaExamResult>(
    `/api/tka/tryout/${packageNumber}/session/${session.sessionId}/submit`,
    { sessionToken: session.sessionToken, reason },
  );
