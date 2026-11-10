import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Response as ExpressResponse } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { OAuth2Client } from "google-auth-library";
import { pool, type PoolClient } from "@workspace/db";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

const SPREADSHEET_ID = "1FNUmVVqjmYrBTXF_NYhedIqUOqC-SdbVktiM4RoEQT8";
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const RECIPIENT_EMAIL = "irawansutiawan@gmail.com";
const GOOGLE_OAUTH_CLIENT_ID =
  "671247982933-b08s3havshvpnf1mhs1dm5iimm6s341l.apps.googleusercontent.com";
const googleOAuthClient = new OAuth2Client(
  GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
);
const QUESTION_COUNT = 30;
const MAX_DURATION_SECONDS = 75 * 60;
const MAX_OTP_ATTEMPTS = 5;
const OTP_LIFETIME_MS = 10 * 60 * 1000;
const PRE_AUTH_LIFETIME_MS = 5 * 60 * 1000;
const CORRECT_ANSWERS: Record<number, number[]> = {
  1: [
    1, 0, 1, 0, 0, 0, 2, 0, 1, 1,
    0, 1, 0, 0, 1, 2, 0, 1, 0, 1,
    1, 2, 1, 2, 1, 1, 0, 1, 2, 1,
  ],
  2: [
    2, 1, 0, 1, 2, 2, 1, 3, 2, 2,
    1, 2, 2, 0, 2, 2, 2, 1, 2, 0,
    2, 0, 1, 2, 2, 2, 2, 2, 1, 2,
  ],
};

type RequestBody = Record<string, unknown>;
type ExamAnswers = Record<string, number>;
type ExamResult = {
  sessionId: string;
  score: number;
  percentage: number;
  answeredCount: number;
  durationSeconds: number;
  submittedAt: string;
  submitReason: string;
  violations: number;
};
type ExamSession = {
  id: string;
  package_number: number;
  email: string;
  name: string;
  school: string;
  device_id: string;
  session_token_hash: string;
  answers: ExamAnswers;
  violation_count: number;
  status: "active" | "submitted";
  started_at: Date;
  expires_at: Date;
  submitted_at: Date | null;
  result: ExamResult | null;
};

class GoogleVerificationError extends Error {
  constructor(
    public readonly code: "GOOGLE_AUTH_REQUIRED" | "GOOGLE_AUTH_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "GoogleVerificationError";
  }
}

const textValue = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const safeHashMatches = (storedHash: string, value: string) => {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(sha256(value), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const connectorResponseText = async (response: Response) => {
  try {
    return await response.clone().text();
  } catch {
    return "";
  }
};

const connectorResponseBody = async (response: Response) =>
  (await connectorResponseText(response)).slice(0, 1000);

const packageNumberFrom = (value: unknown) => {
  const packageNumber = Number(value);
  return packageNumber === 1 || packageNumber === 2 ? packageNumber : null;
};

const findExistingSubmission = async ({
  packageNumber,
  deviceId,
  email,
  sessionId,
  requestId,
}: {
  packageNumber: number;
  deviceId?: string;
  email?: string;
  sessionId?: string;
  requestId?: string | number;
}) => {
  const packageLabel = `Try Out TKA Matematika ${packageNumber}`;
  const response = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:O?majorDimension=ROWS`,
    { method: "GET" },
  );
  const responseText = await connectorResponseText(response);

  if (!response.ok) {
    console.error(`[TKA][Paket ${packageNumber}] Gagal membaca Google Spreadsheet`, {
      requestId,
      status: response.status,
      responseBody: responseText.slice(0, 1000),
    });
    throw new Error(`Google Sheets read failed with status ${response.status}`);
  }

  let rows: unknown[][] = [];
  try {
    const payload = JSON.parse(responseText) as { values?: unknown };
    if (Array.isArray(payload.values)) {
      rows = payload.values.filter((row): row is unknown[] => Array.isArray(row));
    }
  } catch (error) {
    console.error(`[TKA][Paket ${packageNumber}] Respons Google Spreadsheet tidak valid`, {
      requestId,
      error,
    });
    throw new Error("Google Sheets returned an invalid values response.");
  }

  const normalizedEmail = email?.trim().toLowerCase();
  const matchingRow = rows.find((row) => {
    if (String(row[3] ?? "").trim() !== packageLabel) return false;
    return (
      (Boolean(deviceId) && String(row[10] ?? "").trim() === deviceId) ||
      (Boolean(normalizedEmail) &&
        String(row[11] ?? "").trim().toLowerCase() === normalizedEmail) ||
      (Boolean(sessionId) && String(row[12] ?? "").trim() === sessionId)
    );
  });

  return {
    deviceMatched: Boolean(
      matchingRow && deviceId && String(matchingRow[10] ?? "").trim() === deviceId,
    ),
    emailMatched: Boolean(
      matchingRow &&
        normalizedEmail &&
        String(matchingRow[11] ?? "").trim().toLowerCase() === normalizedEmail,
    ),
    sessionMatched: Boolean(
      matchingRow && sessionId && String(matchingRow[12] ?? "").trim() === sessionId,
    ),
  };
};

const verifyGoogleIdToken = async ({
  packageNumber,
  idToken,
  requestId,
}: {
  packageNumber: number;
  idToken: string;
  requestId?: string | number;
}) => {
  if (!idToken) {
    throw new GoogleVerificationError(
      "GOOGLE_AUTH_REQUIRED",
      "Login dengan Google wajib dilakukan sebelum mengikuti try out.",
    );
  }

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_OAUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();
    if (!email || payload?.email_verified !== true) {
      throw new Error("Google account email is not verified.");
    }

    console.log(`[TKA][Paket ${packageNumber}] Verifikasi Google berhasil, email: ${email}`, {
      requestId,
    });
    return email;
  } catch (error) {
    console.error(`[TKA][Paket ${packageNumber}] Verifikasi Google gagal`, {
      requestId,
      error,
    });
    throw new GoogleVerificationError(
      "GOOGLE_AUTH_INVALID",
      "Login Google tidak valid atau sudah kedaluwarsa. Silakan masuk kembali dengan Google.",
    );
  }
};

const sendGoogleMail = async (to: string, subject: string, body: string) => {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
  const encoded = Buffer.from(raw, "utf8").toString("base64url");
  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  const responseBody = await connectorResponseBody(response);
  if (!response.ok) {
    throw new Error(`Gmail send failed with status ${response.status}: ${responseBody}`);
  }
};

const sendOtpEmail = async ({
  email,
  code,
  packageNumber,
}: {
  email: string;
  code: string;
  packageNumber: number;
}) => {
  await sendGoogleMail(
    email,
    `Kode OTP Try Out TKA Matematika ${packageNumber}`,
    [
      `Kode verifikasi Anda: ${code}`,
      "",
      "Kode ini berlaku selama 10 menit dan hanya dapat digunakan satu kali.",
      "Jangan berikan kode ini kepada siapa pun.",
      "",
      "Jika Anda tidak meminta kode ini, abaikan email ini.",
    ].join("\n"),
  );
};

const sendResultEmail = async (session: ExamSession, result: ExamResult) => {
  const durationMinutes = Math.floor(result.durationSeconds / 60);
  const durationRemainder = result.durationSeconds % 60;
  const packageLabel = `Try Out TKA Matematika ${session.package_number}`;
  const body = [
    `Hasil pengerjaan ${packageLabel}`,
    "",
    `Nama lengkap: ${session.name}`,
    `Asal sekolah: ${session.school}`,
    `Email terverifikasi: ${session.email}`,
    `Waktu pengerjaan: ${result.submittedAt}`,
    `Status pengumpulan: ${result.submitReason}`,
    `Pelanggaran mode aman: ${result.violations}`,
    `Terjawab: ${result.answeredCount}/${QUESTION_COUNT}`,
    `Skor benar: ${result.score}/${QUESTION_COUNT}`,
    `Nilai: ${result.percentage}`,
    `Durasi: ${durationMinutes} menit ${durationRemainder} detik`,
    "",
    `Spreadsheet hasil terakumulasi: ${SPREADSHEET_URL}`,
  ].join("\n");

  await sendGoogleMail(
    RECIPIENT_EMAIL,
    `Hasil ${packageLabel} - ${session.name}`,
    body,
  );
};

const toExamResult = (
  session: Pick<
    ExamSession,
    "id" | "package_number" | "answers" | "started_at" | "violation_count"
  >,
  reason: "manual" | "time-up" | "security-violation",
  submittedAt: Date,
): ExamResult => {
  const answerKey = CORRECT_ANSWERS[session.package_number];
  const answeredCount = Object.keys(session.answers).length;
  const score = answerKey.reduce(
    (total, correct, index) =>
      total + (session.answers[String(index + 1)] === correct ? 1 : 0),
    0,
  );
  const durationSeconds = Math.max(
    0,
    Math.min(
      MAX_DURATION_SECONDS,
      Math.floor((submittedAt.getTime() - new Date(session.started_at).getTime()) / 1000),
    ),
  );

  return {
    sessionId: session.id,
    score,
    percentage: Math.round((score / QUESTION_COUNT) * 100),
    answeredCount,
    durationSeconds,
    submittedAt: submittedAt.toISOString(),
    submitReason:
      reason === "time-up"
        ? "Waktu habis (otomatis)"
        : reason === "security-violation"
          ? "Dikumpulkan otomatis - pelanggaran Mode Ujian Aman"
          : "Dikumpulkan oleh peserta",
    violations: session.violation_count,
  };
};

const updateFinalResult = async (
  client: PoolClient,
  session: ExamSession,
  reason: "manual" | "time-up" | "security-violation",
) => {
  const submittedAt = new Date();
  const result = toExamResult(session, reason, submittedAt);
  const update = await client.query(
    `UPDATE tka_exam_sessions
       SET status = 'submitted', submitted_at = $2, submit_reason = $3, result = $4::jsonb
     WHERE id = $1 AND status = 'active'
     RETURNING id`,
    [session.id, submittedAt, reason, JSON.stringify(result)],
  );
  if (update.rowCount !== 1) {
    const existing = await client.query<{ result: ExamResult | null }>(
      "SELECT result FROM tka_exam_sessions WHERE id = $1",
      [session.id],
    );
    if (!existing.rows[0]?.result) throw new Error("Could not finalize exam session.");
    return existing.rows[0].result;
  }
  return result;
};

const deliverResult = async (sessionId: string) => {
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [sessionId],
    );
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return null;

    const loaded = await client.query<ExamSession>(
      "SELECT * FROM tka_exam_sessions WHERE id = $1 AND status = 'submitted'",
      [sessionId],
    );
    const session = loaded.rows[0];
    if (!session?.result) return null;

    let spreadsheetSaved = Boolean(
      (await client.query(
        "SELECT spreadsheet_saved_at FROM tka_exam_sessions WHERE id = $1",
        [sessionId],
      )).rows[0]?.spreadsheet_saved_at,
    );
    let emailSent = Boolean(
      (await client.query(
        "SELECT email_sent_at FROM tka_exam_sessions WHERE id = $1",
        [sessionId],
      )).rows[0]?.email_sent_at,
    );

    if (!spreadsheetSaved) {
      try {
        const existing = await findExistingSubmission({
          packageNumber: session.package_number,
          sessionId,
        });
        if (!existing.sessionMatched) {
          const sheetResponse = await connectors.proxy(
            "google-sheet",
            `/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                values: [[
                  session.result.submittedAt,
                  session.name,
                  session.school,
                  `Try Out TKA Matematika ${session.package_number}`,
                  QUESTION_COUNT,
                  session.result.answeredCount,
                  session.result.score,
                  session.result.percentage,
                  session.result.durationSeconds,
                  session.result.submitReason,
                  session.device_id,
                  session.email,
                  session.id,
                  session.result.violations,
                ]],
              }),
            },
          );
          const responseBody = await connectorResponseBody(sheetResponse);
          if (!sheetResponse.ok) {
            throw new Error(
              `Google Sheets append failed with status ${sheetResponse.status}: ${responseBody}`,
            );
          }
        }
        await client.query(
          "UPDATE tka_exam_sessions SET spreadsheet_saved_at = NOW() WHERE id = $1",
          [sessionId],
        );
        spreadsheetSaved = true;
        console.log(`[TKA][Paket ${session.package_number}] Google Spreadsheet berhasil menerima data`, {
          sessionId,
        });
      } catch (error) {
        console.error(`[TKA][Paket ${session.package_number}] Google Spreadsheet gagal menerima data`, {
          sessionId,
          error,
        });
      }
    }

    if (!emailSent) {
      try {
        await sendResultEmail(session, session.result);
        await client.query(
          "UPDATE tka_exam_sessions SET email_sent_at = NOW() WHERE id = $1",
          [sessionId],
        );
        emailSent = true;
        console.log(`[TKA][Paket ${session.package_number}] Hasil berhasil dikirim melalui email`, {
          sessionId,
        });
      } catch (error) {
        console.error(`[TKA][Paket ${session.package_number}] Gagal mengirim email hasil`, {
          sessionId,
          error,
        });
      }
    }

    return { spreadsheetSaved, emailSent };
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [sessionId]);
    }
    client.release();
  }
};

const readSession = async (
  sessionId: string,
  packageNumber: number,
  sessionToken: string,
  client: PoolClient,
) => {
  const result = await client.query<ExamSession>(
    "SELECT * FROM tka_exam_sessions WHERE id = $1 AND package_number = $2 FOR UPDATE",
    [sessionId, packageNumber],
  );
  const session = result.rows[0];
  if (!session || !safeHashMatches(session.session_token_hash, sessionToken)) {
    return null;
  }
  return session;
};

const sendFinalResponse = async (
  response: ExpressResponse,
  sessionId: string,
  result: ExamResult,
  status = 200,
  autoSubmitted = false,
) => {
  const delivery = await deliverResult(sessionId);
  response.status(status).json({
    ok: true,
    autoSubmitted,
    ...result,
    spreadsheetSaved: delivery?.spreadsheetSaved ?? false,
    emailSent: delivery?.emailSent ?? false,
    spreadsheetUrl: SPREADSHEET_URL,
  });
};

router.post("/tka/tryout/:packageNumber/otp/request", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  if (!packageNumber) {
    res.status(404).json({ message: "Paket try out tidak ditemukan." });
    return;
  }

  try {
    const email = await verifyGoogleIdToken({
      packageNumber,
      idToken: textValue(body.idToken, 10000),
      requestId: String(req.id),
    });
    const duplicate = await findExistingSubmission({
      packageNumber,
      email,
      requestId: String(req.id),
    });
    const active = await pool.query(
      `SELECT 1 FROM tka_exam_sessions
       WHERE package_number = $1 AND email = $2 AND status IN ('active', 'submitted')
       LIMIT 1`,
      [packageNumber, email],
    );
    if (duplicate.emailMatched || active.rowCount) {
      res.status(409).json({
        ok: false,
        code: "DUPLICATE_SUBMISSION",
        message: "Akun Google ini sudah pernah memulai atau mengumpulkan try out ini.",
      });
      return;
    }

    const recent = await pool.query<{ count: string; last_request: Date | null }>(
      `SELECT COUNT(*)::text AS count, MAX(created_at) AS last_request
       FROM tka_otp_challenges
       WHERE package_number = $1 AND email = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
      [packageNumber, email],
    );
    const otpStats = recent.rows[0];
    if (Number(otpStats?.count ?? 0) >= 5) {
      res.status(429).json({
        ok: false,
        code: "OTP_RATE_LIMIT",
        message: "Terlalu banyak permintaan kode. Silakan coba lagi nanti.",
      });
      return;
    }
    if (
      otpStats?.last_request &&
      Date.now() - new Date(otpStats.last_request).getTime() < 60_000
    ) {
      res.status(429).json({
        ok: false,
        code: "OTP_RATE_LIMIT",
        message: "Tunggu satu menit sebelum meminta kode baru.",
      });
      return;
    }

    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
    await pool.query(
      `INSERT INTO tka_otp_challenges (id, package_number, email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, packageNumber, email, sha256(`${id}:${code}`), expiresAt],
    );
    try {
      await sendOtpEmail({ email, code, packageNumber });
    } catch (error) {
      await pool.query("DELETE FROM tka_otp_challenges WHERE id = $1", [id]);
      console.error(`[TKA][Paket ${packageNumber}] Gagal mengirim kode OTP`, {
        requestId: req.id,
        error,
      });
      req.log.error({ err: error }, "Could not send try out email OTP");
      res.status(502).json({
        ok: false,
        code: "OTP_DELIVERY_FAILED",
        message: "Kode verifikasi belum berhasil dikirim. Silakan coba lagi.",
      });
      return;
    }

    console.log(`[TKA][Paket ${packageNumber}] Kode OTP berhasil dikirim`, {
      requestId: req.id,
    });
    res.status(202).json({ ok: true, challengeId: id });
  } catch (error) {
    if (error instanceof GoogleVerificationError) {
      res.status(401).json({ ok: false, code: error.code, message: error.message });
      return;
    }
    console.error(`[TKA][Paket ${packageNumber}] Permintaan OTP gagal`, {
      requestId: req.id,
      error,
    });
    req.log.error({ err: error }, "Could not create try out OTP");
    res.status(502).json({ message: "Permintaan kode verifikasi gagal diproses." });
  }
});

router.post("/tka/tryout/:packageNumber/otp/verify", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  if (!packageNumber) {
    res.status(404).json({ message: "Paket try out tidak ditemukan." });
    return;
  }

  let email: string;
  try {
    email = await verifyGoogleIdToken({
      packageNumber,
      idToken: textValue(body.idToken, 10000),
      requestId: String(req.id),
    });
  } catch (error) {
    if (error instanceof GoogleVerificationError) {
      res.status(401).json({ ok: false, code: error.code, message: error.message });
      return;
    }
    throw error;
  }

  const challengeId = textValue(body.challengeId, 64);
  const code = textValue(body.code, 6);
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
    res.status(400).json({ ok: false, code: "OTP_INVALID", message: "Kode verifikasi tidak valid." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const challengeResult = await client.query<{
      id: string;
      code_hash: string;
      expires_at: Date;
      attempts: number;
      verified_at: Date | null;
      consumed_at: Date | null;
    }>(
      `SELECT id, code_hash, expires_at, attempts, verified_at, consumed_at
       FROM tka_otp_challenges
       WHERE id = $1 AND package_number = $2 AND email = $3
       FOR UPDATE`,
      [challengeId, packageNumber, email],
    );
    const challenge = challengeResult.rows[0];
    if (
      !challenge ||
      challenge.consumed_at ||
      challenge.verified_at ||
      new Date(challenge.expires_at).getTime() <= Date.now()
    ) {
      await client.query("ROLLBACK");
      res.status(400).json({ ok: false, code: "OTP_EXPIRED", message: "Kode sudah kedaluwarsa atau tidak valid." });
      return;
    }
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      await client.query("ROLLBACK");
      res.status(429).json({ ok: false, code: "OTP_ATTEMPTS_EXCEEDED", message: "Batas percobaan kode tercapai. Minta kode baru." });
      return;
    }
    if (!safeHashMatches(challenge.code_hash, `${challengeId}:${code}`)) {
      await client.query(
        "UPDATE tka_otp_challenges SET attempts = attempts + 1 WHERE id = $1",
        [challengeId],
      );
      await client.query("COMMIT");
      res.status(400).json({ ok: false, code: "OTP_INVALID", message: "Kode verifikasi salah." });
      return;
    }

    const preAuthToken = randomBytes(32).toString("base64url");
    await client.query(
      `UPDATE tka_otp_challenges
       SET verified_at = NOW(), pre_auth_hash = $2, pre_auth_expires_at = $3
       WHERE id = $1`,
      [challengeId, sha256(preAuthToken), new Date(Date.now() + PRE_AUTH_LIFETIME_MS)],
    );
    await client.query("COMMIT");
    console.log(`[TKA][Paket ${packageNumber}] OTP berhasil diverifikasi`, {
      requestId: req.id,
    });
    res.json({ ok: true, preAuthToken });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[TKA][Paket ${packageNumber}] Verifikasi OTP gagal`, {
      requestId: req.id,
      error,
    });
    req.log.error({ err: error }, "Could not verify try out email OTP");
    res.status(500).json({ message: "Verifikasi kode gagal diproses." });
  } finally {
    client.release();
  }
});

router.post("/tka/tryout/:packageNumber/access", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  const deviceId = textValue(body.deviceId, 128);
  if (!packageNumber || !deviceId) {
    res.status(400).json({ ok: false, message: "Perangkat ujian tidak valid." });
    return;
  }

  const email = `device-${sha256(deviceId).slice(0, 32)}@numatik.local`;
  const duplicate = await pool.query(
    `SELECT 1 FROM tka_exam_sessions
     WHERE package_number = $1 AND device_id = $2 AND status IN ('active', 'submitted') LIMIT 1`,
    [packageNumber, deviceId],
  );
  if (duplicate.rowCount) {
    res.status(409).json({ ok: false, code: "DUPLICATE_SUBMISSION", message: "Perangkat ini sudah pernah mengikuti try out." });
    return;
  }

  const preAuthToken = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO tka_otp_challenges (id, package_number, email, code_hash, expires_at, verified_at, pre_auth_hash, pre_auth_expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 minutes', NOW(), $5, NOW() + INTERVAL '5 minutes')`,
    [randomUUID(), packageNumber, email, sha256(randomBytes(32).toString("base64url")), sha256(preAuthToken)],
  );
  res.json({ ok: true, preAuthToken });
});

router.post("/tka/tryout/:packageNumber/session/start", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  const preAuthToken = textValue(body.preAuthToken, 128);
  const name = textValue(body.name, 120);
  const school = textValue(body.school, 160);
  const deviceId = textValue(body.deviceId, 128);
  if (!packageNumber) {
    res.status(404).json({ message: "Paket try out tidak ditemukan." });
    return;
  }
  if (!preAuthToken || !name || !school || !deviceId) {
    res.status(400).json({ message: "Token akses aman, biodata, dan device ID wajib tersedia." });
    return;
  }

  const preAuthHash = sha256(preAuthToken);
  const challengeResult = await pool.query<{ email: string }>(
    `SELECT email FROM tka_otp_challenges
     WHERE package_number = $1 AND pre_auth_hash = $2
       AND consumed_at IS NULL AND pre_auth_expires_at > NOW()`,
    [packageNumber, preAuthHash],
  );
  const email = challengeResult.rows[0]?.email;
  if (!email) {
    res.status(401).json({ ok: false, code: "OTP_REQUIRED", message: "Verifikasi ulang kode email sebelum mulai." });
    return;
  }

  try {
    const duplicate = await findExistingSubmission({
      packageNumber,
      deviceId,
      email,
      requestId: String(req.id),
    });
    const existingSession = await pool.query(
      `SELECT 1 FROM tka_exam_sessions
       WHERE package_number = $1 AND status IN ('active', 'submitted')
         AND (email = $2 OR device_id = $3)
       LIMIT 1`,
      [packageNumber, email, deviceId],
    );
    if (
      duplicate.deviceMatched ||
      duplicate.emailMatched ||
      existingSession.rowCount
    ) {
      res.status(409).json({
        ok: false,
        code: "DUPLICATE_SUBMISSION",
        message: "Perangkat atau akun Google ini sudah pernah memulai atau mengerjakan try out.",
      });
      return;
    }

    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString("base64url");
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + MAX_DURATION_SECONDS * 1000);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const consumed = await client.query(
        `UPDATE tka_otp_challenges
         SET consumed_at = NOW()
         WHERE package_number = $1 AND pre_auth_hash = $2
           AND consumed_at IS NULL AND pre_auth_expires_at > NOW()
         RETURNING email`,
        [packageNumber, preAuthHash],
      );
      if (consumed.rowCount !== 1 || consumed.rows[0]?.email !== email) {
        await client.query("ROLLBACK");
        res.status(401).json({ ok: false, code: "OTP_REQUIRED", message: "Kode verifikasi sudah digunakan." });
        return;
      }
      await client.query(
        `INSERT INTO tka_exam_sessions
         (id, package_number, email, name, school, device_id, session_token_hash, started_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sessionId,
          packageNumber,
          email,
          name,
          school,
          deviceId,
          sha256(sessionToken),
          startedAt,
          expiresAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof Error && "code" in error && error.code === "23505") {
        res.status(409).json({
          ok: false,
          code: "DUPLICATE_SUBMISSION",
          message: "Perangkat atau akun Google ini sudah memulai try out.",
        });
        return;
      }
      throw error;
    } finally {
      client.release();
    }

    console.log(`[TKA][Paket ${packageNumber}] Sesi ujian dimulai`, {
      requestId: req.id,
      sessionId,
    });
    res.status(201).json({
      ok: true,
      sessionId,
      sessionToken,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error(`[TKA][Paket ${packageNumber}] Gagal memulai sesi`, {
      requestId: req.id,
      error,
    });
    req.log.error({ err: error }, "Could not start authoritative try out session");
    res.status(502).json({ message: "Sesi ujian belum berhasil dimulai. Silakan coba lagi." });
  }
});

router.post("/tka/tryout/:packageNumber/session/:sessionId/answer", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  const sessionToken = textValue(body.sessionToken, 128);
  const questionNumber = Number(body.questionNumber);
  const answerIndex = Number(body.answerIndex);
  if (!packageNumber) {
    res.status(404).json({ message: "Paket try out tidak ditemukan." });
    return;
  }
  if (
    !Number.isInteger(questionNumber) ||
    questionNumber < 1 ||
    questionNumber > QUESTION_COUNT ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex > 3
  ) {
    res.status(400).json({ message: "Jawaban tidak valid." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await readSession(req.params.sessionId, packageNumber, sessionToken, client);
    if (!session) {
      await client.query("ROLLBACK");
      res.status(401).json({ message: "Sesi ujian tidak valid." });
      return;
    }
    if (session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      res.status(409).json({ code: "EXAM_EXPIRED", message: "Sesi ujian sudah berakhir." });
      return;
    }

    const answers = { ...session.answers, [String(questionNumber)]: answerIndex };
    await client.query(
      "UPDATE tka_exam_sessions SET answers = $2::jsonb WHERE id = $1",
      [session.id, JSON.stringify(answers)],
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[TKA][Paket ${packageNumber}] Gagal menyimpan jawaban`, {
      requestId: req.id,
      error,
    });
    req.log.error({ err: error }, "Could not save try out answer");
    res.status(500).json({ message: "Jawaban belum tersimpan di server." });
  } finally {
    client.release();
  }
});

router.post("/tka/tryout/:packageNumber/session/:sessionId/violation", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  const sessionToken = textValue(body.sessionToken, 128);
  const clientEventId = textValue(body.eventId, 64);
  if (!packageNumber) {
    res.status(404).json({ message: "Paket try out tidak ditemukan." });
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(clientEventId)) {
    res.status(400).json({ message: "ID peristiwa pelanggaran tidak valid." });
    return;
  }

  const client = await pool.connect();
  let result: ExamResult | null = null;
  let autoSubmitted = false;
  let violationCount = 0;
  try {
    await client.query("BEGIN");
    const session = await readSession(req.params.sessionId, packageNumber, sessionToken, client);
    if (!session) {
      await client.query("ROLLBACK");
      res.status(401).json({ message: "Sesi ujian tidak valid." });
      return;
    }

    const alreadyRecorded = await client.query<{ violation_number: number }>(
      `SELECT violation_number FROM tka_exam_violations
       WHERE session_id = $1 AND client_event_id = $2`,
      [session.id, clientEventId],
    );
    if (alreadyRecorded.rowCount) {
      violationCount = session.violation_count;
      result = session.result;
      autoSubmitted = session.status === "submitted";
    } else if (session.status === "submitted") {
      violationCount = session.violation_count;
      result = session.result;
      autoSubmitted = true;
    } else {
      const event = await client.query<{ violation_number: number }>(
        `INSERT INTO tka_exam_violations (session_id, client_event_id, violation_number)
         VALUES ($1, $2, $3) RETURNING violation_number`,
        [session.id, clientEventId, session.violation_count + 1],
      );
      violationCount = event.rows[0]?.violation_number ?? session.violation_count + 1;
      session.violation_count = violationCount;
      await client.query(
        "UPDATE tka_exam_sessions SET violation_count = $2 WHERE id = $1",
        [session.id, violationCount],
      );
      console.warn(`[TKA][Paket ${packageNumber}] Pelanggaran Mode Ujian Aman tercatat`, {
        requestId: req.id,
        sessionId: session.id,
        violationCount,
      });

      if (violationCount >= 3 || new Date(session.expires_at).getTime() <= Date.now()) {
        const reason = violationCount >= 3 ? "security-violation" : "time-up";
        result = await updateFinalResult(client, session, reason);
        autoSubmitted = true;
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[TKA][Paket ${packageNumber}] Gagal mencatat pelanggaran`, {
      requestId: req.id,
      error,
    });
    req.log.error({ err: error }, "Could not record secure exam violation");
    res.status(500).json({ message: "Pelanggaran belum berhasil dicatat di server." });
    return;
  } finally {
    client.release();
  }

  if (autoSubmitted && result) {
    console.warn(`[TKA][Paket ${packageNumber}] Auto-submit server-side dipicu`, {
      sessionId: req.params.sessionId,
      violationCount,
    });
    await sendFinalResponse(res, req.params.sessionId, result, 200, true);
    return;
  }
  res.json({ ok: true, violations: violationCount, autoSubmitted: false });
});

router.post("/tka/tryout/:packageNumber/session/:sessionId/submit", async (req, res) => {
  const packageNumber = packageNumberFrom(req.params.packageNumber);
  const body = req.body as RequestBody;
  const sessionToken = textValue(body.sessionToken, 128);
  const reason = body.reason === "time-up" ? "time-up" : "manual";
  if (!packageNumber) {
    res.status(404).json({ message: "Paket try out tidak ditemukan." });
    return;
  }

  const client = await pool.connect();
  let result: ExamResult | null = null;
  try {
    await client.query("BEGIN");
    const session = await readSession(req.params.sessionId, packageNumber, sessionToken, client);
    if (!session) {
      await client.query("ROLLBACK");
      res.status(401).json({ message: "Sesi ujian tidak valid." });
      return;
    }
    if (session.status === "submitted" && session.result) {
      result = session.result;
    } else {
      const expired = new Date(session.expires_at).getTime() <= Date.now();
      if (reason === "time-up" && !expired) {
        await client.query("ROLLBACK");
        res.status(409).json({ code: "EXAM_NOT_EXPIRED", message: "Waktu ujian di server belum habis." });
        return;
      }
      if (expired && reason !== "time-up") {
        await client.query("ROLLBACK");
        res.status(409).json({ code: "EXAM_EXPIRED", message: "Waktu ujian telah habis." });
        return;
      }
      result = await updateFinalResult(client, session, reason);
      console.log(`[TKA][Paket ${packageNumber}] Submit final dikunci di server`, {
        requestId: req.id,
        sessionId: session.id,
        reason,
      });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof Error && "code" in error && error.code === "23505") {
      res.status(409).json({
        ok: false,
        code: "DUPLICATE_SUBMISSION",
        message: "Perangkat atau akun Google ini sudah pernah mengumpulkan try out.",
      });
      return;
    }
    console.error(`[TKA][Paket ${packageNumber}] Submit sesi gagal`, {
      requestId: req.id,
      error,
    });
    req.log.error({ err: error }, "Could not finalize try out session");
    res.status(500).json({ message: "Hasil ujian belum berhasil dikunci." });
    return;
  } finally {
    client.release();
  }

  if (!result) {
    res.status(500).json({ message: "Hasil ujian tidak tersedia." });
    return;
  }
  await sendFinalResponse(res, req.params.sessionId, result, 201);
});

export const processPendingTkaSubmissions = async () => {
  const expiredSessions = await pool.query<{ id: string }>(
    `SELECT id FROM tka_exam_sessions
     WHERE status = 'active' AND expires_at <= NOW()
     ORDER BY expires_at
     LIMIT 50`,
  );

  for (const { id } of expiredSessions.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sessionResult = await client.query<ExamSession>(
        "SELECT * FROM tka_exam_sessions WHERE id = $1 FOR UPDATE SKIP LOCKED",
        [id],
      );
      const session = sessionResult.rows[0];
      if (session?.status === "active" && new Date(session.expires_at).getTime() <= Date.now()) {
        await updateFinalResult(client, session, "time-up");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[TKA] Gagal mengunci sesi try out yang kedaluwarsa", { sessionId: id, error });
    } finally {
      client.release();
    }
  }

  const pendingDelivery = await pool.query<{ id: string }>(
    `SELECT id FROM tka_exam_sessions
     WHERE status = 'submitted'
       AND (spreadsheet_saved_at IS NULL OR email_sent_at IS NULL)
     ORDER BY submitted_at
     LIMIT 50`,
  );
  for (const { id } of pendingDelivery.rows) {
    await deliverResult(id);
  }
};

export default router;
