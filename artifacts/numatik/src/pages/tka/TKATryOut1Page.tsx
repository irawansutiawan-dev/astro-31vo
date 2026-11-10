import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Menu,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import Starfield from "@/components/Starfield";
import PageNavigation from "@/components/PageNavigation";
import { playPopSound } from "@/hooks/useAudio";
import { SecureExamBadge, SecureExamDialog, useSecureExam } from "@/components/tka/SecureExamGuard";
import {
  saveTkaExamAnswer,
  startTkaExamSession,
  submitTkaExamSession,
  reportTkaExamViolation,
  requestTkaExamAccess,
  TkaExamApiError,
  type TkaExamResult,
  type TkaSessionCredentials,
} from "@/lib/tkaExamApi";
import { useLanguage } from "@/contexts/LanguageContext";

type Question = {
  number: number;
  topic: string;
  prompt: ReactNode;
  options: string[];
  correct: number;
};

const QUESTIONS: Question[] = [
  {
    number: 1,
    topic: "Bilangan berpangkat",
    prompt: <>Hasil dari operasi berikut adalah .... <strong>(5⁴ × 5⁻²) ÷ 5³</strong></>,
    options: ["A. 5⁻³", "B. 5⁻¹", "C. 5¹", "D. 5³"],
    correct: 1,
  },
  {
    number: 2,
    topic: "Aritmetika sosial",
    prompt: <>Sebuah tas seharga Rp240.000,00 mendapat diskon 25%. Besar potongan harga yang diperoleh adalah ....</>,
    options: ["A. Rp60.000,00", "B. Rp65.000,00", "C. Rp75.000,00", "D. Rp80.000,00"],
    correct: 0,
  },
  {
    number: 3,
    topic: "Membaca data",
    prompt: <>Data berat empat buah adalah P = 142,5 gram, Q = 156,2 gram, R = 151,8 gram, dan S = 148,6 gram. Buah dengan berat paling besar adalah ....</>,
    options: ["A. Buah P", "B. Buah Q", "C. Buah R", "D. Buah S"],
    correct: 1,
  },
  {
    number: 4,
    topic: "Bilangan bulat",
    prompt: <>Suhu penyimpanan Vaksin K adalah −18°C. Pernyataan yang tepat tentang suhu tersebut adalah ....</>,
    options: ["A. 18°C di bawah titik beku", "B. 18°C di atas titik beku", "C. 8°C di bawah titik beku", "D. 8°C di atas titik beku"],
    correct: 0,
  },
  {
    number: 5,
    topic: "Bentuk aljabar",
    prompt: <>Sederhanakan bentuk aljabar berikut: <strong>4x + 3y + 2x − y</strong>.</>,
    options: ["A. 6x + 2y", "B. 6x + 4y", "C. 2x + 2y", "D. 2x + 4y"],
    correct: 0,
  },
  {
    number: 6,
    topic: "Relasi dan fungsi",
    prompt: <>Diketahui pasangan (2, 9.000) dan (4, 15.000). Jika hubungan harga dinyatakan dengan f(x) = ax + b, rumus fungsi yang sesuai adalah ....</>,
    options: ["A. f(x) = 3.000x + 3.000", "B. f(x) = 3.000x + 1.000", "C. f(x) = 2.000x + 5.000", "D. f(x) = 2.500x + 4.000"],
    correct: 0,
  },
  {
    number: 7,
    topic: "Pola bilangan",
    prompt: <>Banyak ubin pada pola ke-n dirumuskan dengan 3n + 2. Banyak ubin pada pola ke-8 adalah ....</>,
    options: ["A. 22 ubin", "B. 24 ubin", "C. 26 ubin", "D. 28 ubin"],
    correct: 2,
  },
  {
    number: 8,
    topic: "Pertidaksamaan linear",
    prompt: <>Himpunan penyelesaian dari <strong>4x − 7 &gt; x + 5</strong> adalah ....</>,
    options: ["A. x &gt; 4", "B. x &lt; 4", "C. x ≥ 4", "D. x ≤ 4"],
    correct: 0,
  },
  {
    number: 9,
    topic: "SPLDV",
    prompt: <>Diketahui 2p + q = 23 dan p + q = 13. Nilai 3p + 2q adalah ....</>,
    options: ["A. 30", "B. 33", "C. 36", "D. 39"],
    correct: 2,
  },
  {
    number: 10,
    topic: "Barisan aritmetika",
    prompt: <>Barisan 5, 8, 11, 14, ... memiliki suku ke-12 sebesar ....</>,
    options: ["A. 35", "B. 36", "C. 38", "D. 40"],
    correct: 2,
  },
  {
    number: 11,
    topic: "Garis dan sudut",
    prompt: <>Dua sudut bertolak belakang sama besar. Jika salah satunya (4x + 8)° dan yang lain 72°, nilai x adalah ....</>,
    options: ["A. 14", "B. 16", "C. 18", "D. 20"],
    correct: 1,
  },
  {
    number: 12,
    topic: "Bangun ruang",
    prompt: <>Banyak rusuk prisma segi enam adalah ....</>,
    options: ["A. 12", "B. 15", "C. 18", "D. 24"],
    correct: 2,
  },
  {
    number: 13,
    topic: "Garis sejajar",
    prompt: <>Dua garis sejajar dipotong dua garis miring. Sudut kemiringan terhadap garis sejajar masing-masing 70° dan 50°. Besar sudut di antara kedua garis miring pada puncaknya adalah ....</>,
    options: ["A. 100°", "B. 110°", "C. 120°", "D. 130°"],
    correct: 2,
  },
  {
    number: 14,
    topic: "Teorema Pythagoras",
    prompt: <>Tiang setinggi 9 m diberi kabel ke titik tanah yang berjarak 12 m dari kaki tiang. Pilihan kabel paling pendek yang cukup adalah ....</>,
    options: ["A. 15,5 m", "B. 14 m", "C. 13 m", "D. 12 m"],
    correct: 0,
  },
  {
    number: 15,
    topic: "Transformasi geometri",
    prompt: <>Titik A(4, −2) dicerminkan terhadap sumbu-y. Koordinat bayangannya adalah ....</>,
    options: ["A. (4, 2)", "B. (−4, −2)", "C. (−4, 2)", "D. (2, −4)"],
    correct: 1,
  },
  {
    number: 16,
    topic: "Lingkaran",
    prompt: <>Dua juring memiliki sudut pusat 120° dan 40° pada lingkaran yang sama. Luas juring dengan sudut 120° adalah .... kali luas juring dengan sudut 40°.</>,
    options: ["A. 2", "B. 2,5", "C. 3", "D. 4"],
    correct: 2,
  },
  {
    number: 17,
    topic: "Kesebangunan",
    prompt: <>Persegi panjang besar berukuran 30 cm × 18 cm. Persegi panjang kecil sebangun dan tingginya 6 cm. Keliling persegi panjang kecil adalah ....</>,
    options: ["A. 28 cm", "B. 30 cm", "C. 32 cm", "D. 36 cm"],
    correct: 2,
  },
  {
    number: 18,
    topic: "Volume dan satuan",
    prompt: <>Sebuah tangki berukuran 4 dm × 1,2 m × 0,5 m berisi penuh. Setelah 400 botol berukuran 0,5 liter diisi, sisa cairan dapat memenuhi jeriken 2 liter sebanyak ....</>,
    options: ["A. 10 jeriken", "B. 20 jeriken", "C. 25 jeriken", "D. 30 jeriken"],
    correct: 1,
  },
  {
    number: 19,
    topic: "Pembagian volume",
    prompt: <>Tersedia 450 liter madu A dan 960 liter madu B. Pak Budi membawa jeriken 15 liter. Kombinasi yang mungkin dibawa Pak Budi adalah ....</>,
    options: ["A. 10 jeriken A dan 24 jeriken B", "B. 8 jeriken A dan 40 jeriken B", "C. 12 jeriken A dan 25 jeriken B", "D. 7 jeriken A dan 31 jeriken B"],
    correct: 0,
  },
  {
    number: 20,
    topic: "Statistika",
    prompt: <>Produksi kopi berturut-turut 1,20; 1,15; 1,05; 0,98 juta ton, sedangkan produksi teh 1,05; 1,06; 1,08; 1,10 juta ton. Kesimpulan yang benar adalah ....</>,
    options: ["A. Kopi dan teh sama-sama meningkat", "B. Kopi menurun dan teh meningkat", "C. Kopi meningkat dan teh menurun", "D. Kopi dan teh sama-sama menurun"],
    correct: 1,
  },
  {
    number: 21,
    topic: "Modus",
    prompt: <>Modus dari data 8, 11, 9, 10, 9, 12, 9, 8, 10, 9 adalah ....</>,
    options: ["A. 8", "B. 9", "C. 10", "D. 11"],
    correct: 1,
  },
  {
    number: 22,
    topic: "Rata-rata",
    prompt: <>Rata-rata data 7, 8, 9, 10, 9, 8, 11, 10, 9 adalah ....</>,
    options: ["A. 8", "B. 9", "C. 10", "D. 11"],
    correct: 1,
  },
  {
    number: 23,
    topic: "Peluang",
    prompt: <>Dalam kotak terdapat 7 bola merah, 5 bola biru, dan 8 bola hijau. Jika 3 bola hijau diambil, peluang terambil bola merah pada pengambilan berikutnya adalah ....</>,
    options: ["A. 7/17", "B. 7/20", "C. 5/17", "D. 8/17"],
    correct: 0,
  },
  {
    number: 24,
    topic: "Frekuensi relatif",
    prompt: <>Dari 60 percobaan, suatu kejadian muncul 18 kali. Frekuensi relatif kejadian tersebut adalah ....</>,
    options: ["A. 20%", "B. 25%", "C. 30%", "D. 35%"],
    correct: 2,
  },
  {
    number: 25,
    topic: "Peluang teoretik",
    prompt: <>Dua dadu dilempar bersamaan. Peluang jumlah mata dadu sama dengan 9 adalah ....</>,
    options: ["A. 1/9", "B. 1/8", "C. 1/6", "D. 1/4"],
    correct: 0,
  },
  {
    number: 26,
    topic: "Rata-rata data",
    prompt: <>Nilai lima siswa adalah 12, 15, 11, 14, dan 18. Rata-rata nilai mereka adalah ....</>,
    options: ["A. 13", "B. 14", "C. 15", "D. 16"],
    correct: 1,
  },
  {
    number: 27,
    topic: "Keliling lingkaran",
    prompt: <>Keliling lingkaran dengan jari-jari 14 cm (π = 22/7) adalah ....</>,
    options: ["A. 44 cm", "B. 66 cm", "C. 77 cm", "D. 88 cm"],
    correct: 3,
  },
  {
    number: 28,
    topic: "Volume kerucut",
    prompt: <>Volume kerucut dengan jari-jari 7 cm dan tinggi 12 cm (π = 22/7) adalah ....</>,
    options: ["A. 308 cm³", "B. 616 cm³", "C. 924 cm³", "D. 1.232 cm³"],
    correct: 1,
  },
  {
    number: 29,
    topic: "Persamaan kuadrat",
    prompt: <>Himpunan penyelesaian persamaan x² − 7x + 12 = 0 adalah ....</>,
    options: ["A. {1, 2}", "B. {2, 5}", "C. {3, 4}", "D. {4, 5}"],
    correct: 2,
  },
  {
    number: 30,
    topic: "Peluang komplemen",
    prompt: <>Sebuah kantong berisi 5 kelereng merah, 3 biru, dan 2 hijau. Peluang mengambil kelereng yang bukan biru adalah ....</>,
    options: ["A. 3/10", "B. 7/10", "C. 1/2", "D. 2/5"],
    correct: 1,
  },
];

const TOTAL_SECONDS = 75 * 60;
type TryOutStage = "notice" | "biodata" | "countdown" | "exam" | "submitted";
type SubmissionState = "idle" | "saving" | "saved" | "error";

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
};

const TKATryOut1Page = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [stage, setStage] = useState<TryOutStage>("notice");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [preAuthToken, setPreAuthToken] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [submissionError, setSubmissionError] = useState("");
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [spreadsheetSaved, setSpreadsheetSaved] = useState<boolean | null>(null);
  const [finishedReason, setFinishedReason] = useState<"manual" | "time-up" | "security-violation">("manual");
  const [serverScore, setServerScore] = useState<number | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showQuestionPanel, setShowQuestionPanel] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches,
  );
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches,
  );
  const finishingRef = useRef(false);
  const serverSessionRef = useRef<TkaSessionCredentials | null>(null);
  const answerSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const answerSaveErrorRef = useRef<unknown>(null);
  const startingSessionRef = useRef(false);

  const question = QUESTIONS[current];
  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () => QUESTIONS.reduce((total, item) => total + (answers[item.number] === item.correct ? 1 : 0), 0),
    [answers],
  );
  const isUrgent = remaining <= 5 * 60;

  useEffect(() => {
    if (stage !== "countdown" || countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      setCountdown(null);
      if (startingSessionRef.current || !preAuthToken) return;
      startingSessionRef.current = true;
      void startTkaExamSession(1, preAuthToken, fullName, school)
        .then((session) => {
          serverSessionRef.current = session;
          setRemaining(TOTAL_SECONDS);
          setStage("exam");
        })
        .catch((error: unknown) => {
          startingSessionRef.current = false;
          setSubmissionError(
            error instanceof Error
              ? error.message
              : "Sesi ujian gagal dimulai. Verifikasi OTP kembali.",
          );
          setStage("biodata");
        });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, fullName, preAuthToken, school, stage]);

  useEffect(() => {
    if (stage !== "exam") return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(orientation: landscape)");
    const handleOrientationChange = () => {
      setIsLandscape(mediaQuery.matches);
      setShowQuestionPanel(mediaQuery.matches);
    };

    handleOrientationChange();
    mediaQuery.addEventListener("change", handleOrientationChange);
    return () => mediaQuery.removeEventListener("change", handleOrientationChange);
  }, []);

  const translateApiError = (error: unknown) => {
    const code = error instanceof TkaExamApiError ? error.code : undefined;
    if (code === "DUPLICATE_SUBMISSION") {
      return language === "en"
        ? "This device or Google account has already started or submitted this try out."
        : language === "ja"
          ? "この端末またはGoogleアカウントでは、この試験をすでに開始または提出済みです。"
          : "Perangkat atau akun Google ini sudah pernah memulai atau mengumpulkan try out ini.";
    }
    if (code === "EXAM_EXPIRED") {
      return language === "en"
        ? "The exam session has expired."
        : language === "ja"
          ? "試験セッションの有効期限が切れました。"
          : "Sesi ujian sudah berakhir.";
    }
    return error instanceof Error
      ? error.message
      : language === "en"
        ? "The exam server could not complete the request."
        : language === "ja"
          ? "試験サーバーでリクエストを完了できませんでした。"
          : "Server ujian gagal menyelesaikan permintaan.";
  };

  const applyServerResult = (result: Partial<TkaExamResult>) => {
    setServerScore(typeof result.score === "number" ? result.score : null);
    setEmailSent(result.emailSent ?? false);
    setSpreadsheetSaved(result.spreadsheetSaved ?? false);
    setSubmissionState("saved");
    setStage("submitted");
  };

  const finishExam = async (reason: "manual" | "time-up") => {
    if (stage !== "exam" || finishingRef.current) {
      console.warn("[TKA Paket 1] Submit diabaikan oleh guard frontend", {
        stage,
        alreadyFinishing: finishingRef.current,
        reason,
      });
      return;
    }

    finishingRef.current = true;
    setFinishedReason(reason);
    setSubmissionState("saving");
    setSubmissionError("");
    try {
      await answerSaveQueueRef.current;
      if (answerSaveErrorRef.current) {
        throw answerSaveErrorRef.current;
      }
      const session = serverSessionRef.current;
      if (!session) throw new Error("Sesi ujian server tidak tersedia.");
      const result = await submitTkaExamSession(1, session, reason);
      applyServerResult(result);
    } catch (error) {
      console.error("[TKA Paket 1] Error saat submit", error);
      finishingRef.current = false;
      setSubmissionState("error");
      setSubmissionError(translateApiError(error));
    }
  };

  const chooseAnswer = (optionIndex: number) => {
    if (stage !== "exam") return;
    playPopSound();
    setAnswers((previous) => ({ ...previous, [question.number]: optionIndex }));
    const session = serverSessionRef.current;
    if (!session) return;
    answerSaveQueueRef.current = answerSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveTkaExamAnswer(1, session, question.number, optionIndex))
      .then(() => {
        answerSaveErrorRef.current = null;
        setSubmissionError("");
      })
      .catch((error: unknown) => {
        answerSaveErrorRef.current = error;
        setSubmissionError(translateApiError(error));
      });
  };

  const goTo = (index: number) => {
    setCurrent(Math.max(0, Math.min(QUESTIONS.length - 1, index)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startExam = async () => {
    if (!fullName.trim() || !school.trim()) {
      setSubmissionError("Nama lengkap dan asal sekolah wajib diisi.");
      return;
    }
  await security.requestExamFullscreen();
  if (!preAuthToken) {
    try {
      const access = await requestTkaExamAccess(1);
      setPreAuthToken(access.preAuthToken);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Akses aman gagal dibuat.");
      return;
    }
  }
    setSubmissionError("");
    await security.requestExamFullscreen();
    setCountdown(3);
    setStage("countdown");
    playPopSound();
  };

  const submitExam = (reason: "manual" | "time-up" = "manual") => {
    setShowSubmitDialog(false);
    playPopSound();
    void finishExam(reason);
  };

  const security = useSecureExam({
    active: stage === "exam",
    submitted: stage === "submitted",
    onViolation: async (eventId) => {
      const session = serverSessionRef.current;
      if (!session) throw new Error("Sesi ujian server tidak tersedia.");
      return reportTkaExamViolation(1, session, eventId);
    },
    onViolationError: (error) => {
      console.error("[TKA][Paket 1] Pelanggaran gagal dicatat di server", error);
      setSubmissionError(translateApiError(error));
    },
    onAutoSubmit: (result) => {
      console.error("[TKA][Paket 1] Auto-submit terpicu — pelanggaran ke-3 Mode Ujian Aman");
      finishingRef.current = true;
      setFinishedReason("security-violation");
      applyServerResult(result);
    },
  });

  useEffect(() => {
    if (stage === "exam" && remaining === 0) void finishExam("time-up");
  }, [remaining, stage]);

  const restartExam = () => {
    finishingRef.current = false;
    setStage("notice");
    setAnswers({});
    setCurrent(0);
    setRemaining(TOTAL_SECONDS);
    setFullName("");
    setSchool("");
    setPreAuthToken("");
    serverSessionRef.current = null;
    answerSaveQueueRef.current = Promise.resolve();
    answerSaveErrorRef.current = null;
    startingSessionRef.current = false;
    setCountdown(null);
    setSubmissionState("idle");
    setSubmissionError("");
    setEmailSent(null);
    setSpreadsheetSaved(null);
    setServerScore(null);
    setShowSubmitDialog(false);
    security.resetSecurity();
  };

  if (stage === "notice" || stage === "biodata" || stage === "countdown") {
    return (
      <div className="tka-exam-page relative min-h-screen gradient-space overflow-x-hidden">
        <Starfield />
        <PageNavigation />
        <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10 sm:px-6">
          <section className="w-full rounded-3xl border border-cyan-300/25 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/25 backdrop-blur sm:p-8">
            {stage === "notice" && (
              <>
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-400/10">
                    <Clock3 className="h-6 w-6 text-amber-200" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">Pemberitahuan sebelum mulai</p>
                    <h1 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">TRY OUT TKA MATEMATIKA</h1>
                    <p className="mt-1 text-xs text-white/50">Tahun Pelajaran 2026 / 2027 · 30 soal</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm leading-7 text-amber-50/85">
                  <p className="font-bold text-amber-100">Perhatikan sebelum mengikuti try out:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs sm:text-sm">
                    <li>Setelah dimulai, layar pengerjaan akan terkunci dalam satu sesi selama maksimal <strong>75 menit</strong>.</li>
                    <li>Waktu akan mulai dihitung setelah hitungan mundur 3–2–1 selesai.</li>
                    <li>Jika waktu habis, jawaban otomatis dikumpulkan dan tidak dapat diubah.</li>
                    <li>Isi biodata dengan nama lengkap dan asal sekolah yang benar.</li>
                  </ul>
                </div>
                <button
                  onClick={() => { setStage("biodata"); playPopSound(); }}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500/20 px-4 py-3.5 text-sm font-bold text-cyan-100 ring-1 ring-cyan-300/40 transition hover:bg-cyan-500/30"
                >
                  Lanjut ke biodata <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            {stage === "biodata" && (
              <>
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">Langkah 1 dari 2</p>
                  <h1 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">Isi biodata peserta</h1>
                  <p className="mt-2 text-sm leading-6 text-white/55">Data ini dicatat bersama hasil pengerjaan di spreadsheet rekapitulasi.</p>
                </div>
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-cyan-100/80">Nama lengkap</span>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Contoh: Siti Aminah"
                      autoComplete="name"
                      className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-cyan-100/80">Asal sekolah</span>
                    <input
                      value={school}
                      onChange={(event) => setSchool(event.target.value)}
                      placeholder="Contoh: SMP Numatik"
                      autoComplete="organization"
                      className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                    />
                  </label>
                </div>
                <p className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/5 px-4 py-3 text-xs leading-relaxed text-cyan-100/75">
                  Akses aman dibuat otomatis oleh server saat tombol mulai ditekan. Tidak diperlukan Google Authenticator atau OTP.
                </p>
                {submissionError && <p className="mt-3 text-xs font-semibold text-rose-300">{submissionError}</p>}
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => { setStage("notice"); setSubmissionError(""); }}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-bold text-white/65 transition hover:bg-white/10"
                  >
                    <ChevronLeft className="h-4 w-4" /> Kembali
                  </button>
                  <button
                    onClick={startExam}
                    disabled={startingSessionRef.current}
                    className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-500/20 px-4 py-3.5 text-sm font-bold text-emerald-100 ring-1 ring-emerald-300/40 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Mulai Try Out <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            {stage === "countdown" && (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300/70">Bersiap</p>
                <p className="mt-2 text-sm text-white/60">Try out akan dimulai dalam</p>
                <div className="my-5 flex h-36 w-36 items-center justify-center rounded-full border-4 border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_60px_rgba(34,211,238,0.25)]">
                  <span className="font-display text-7xl font-black text-cyan-100">{countdown}</span>
                </div>
                <p className="text-xs text-white/40">Setelah angka 1, waktu 75 menit langsung berjalan.</p>
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  const submitted = stage === "submitted";
  const displayedScore = serverScore ?? score;

  return (
    <div className="tka-exam-page relative min-h-screen gradient-space overflow-x-hidden">
      <Starfield />
      <PageNavigation hidden={stage === "exam"} />

      <main className="relative z-10 mx-auto w-full max-w-7xl px-3 pb-10 pt-6 sm:px-5 lg:px-8">
        <header className="mb-4 rounded-2xl border border-cyan-400/25 bg-slate-950/75 p-4 shadow-xl shadow-cyan-950/20 backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/logo-numatik.png" alt="NUMATIK" className="h-12 w-12 shrink-0 rounded-xl object-contain shadow-lg shadow-cyan-950/30" />
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/75">
                  <Flag className="h-3.5 w-3.5" />
                  Try Out TKA Matematika
                </div>
                <h1 className="font-display text-lg font-bold tracking-wide text-white sm:text-2xl">
                  Try Out TKA Matematika 1
                </h1>
                <p className="mt-1 text-xs text-white/50">Tahun Pelajaran 2026 / 2027 · 30 soal · Kelas IX · Batas waktu 75 menit</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <SecureExamBadge
                active={stage === "exam"}
                isFullscreen={security.isFullscreen}
                nativeMode={security.nativeMode}
                violations={security.violations}
              />
              <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isUrgent ? "border-red-400/60 bg-red-500/15 text-red-200" : "border-amber-300/30 bg-amber-500/10 text-amber-100"}`}>
                <Clock3 className={`h-5 w-5 ${isUrgent ? "animate-pulse text-red-300" : "text-amber-300"}`} />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/45">Sisa waktu</p>
                  <p className="font-mono text-xl font-bold leading-none">{formatTime(remaining)}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {security.fullscreenWarning && stage === "exam" && (
          <div className="mb-4 rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-100">
            {security.fullscreenWarning}
          </div>
        )}

        {submitted && (
          <section className="mb-4 rounded-2xl border border-emerald-400/35 bg-emerald-950/45 p-4 shadow-lg shadow-emerald-950/20 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" />
                <div>
                  <h2 className="font-display text-base font-bold text-emerald-100">
                    {submissionState === "error" ? "Pengumpulan ditolak" : "Try out selesai dikumpulkan"}
                  </h2>
                  <p className="mt-1 text-xs text-emerald-100/65">
                    Jawaban dikerjakan {answeredCount} dari {QUESTIONS.length} soal · Skor {displayedScore}/{QUESTIONS.length}
                  </p>
                  {finishedReason === "security-violation" && (
                    <p className="mt-2 text-xs font-semibold text-rose-200">{security.copy.autoSubmitNote}</p>
                  )}
                  {submissionState === "saving" && <p className="mt-2 text-xs text-amber-200">Menyimpan hasil ke spreadsheet...</p>}
                  {submissionState === "saved" && spreadsheetSaved && emailSent && <p className="mt-2 text-xs text-emerald-200">Hasil sudah masuk ke spreadsheet dan notifikasi email.</p>}
                  {submissionState === "saved" && (!spreadsheetSaved || !emailSent) && <p className="mt-2 text-xs text-amber-200">Hasil sudah dikunci di server, tetapi pengiriman spreadsheet atau email sedang dicoba kembali.</p>}
                  {submissionState === "error" && <p className="mt-2 text-xs text-rose-300">{submissionError}</p>}
                </div>
              </div>
              <button onClick={restartExam} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20">
                <RotateCcw className="h-3.5 w-3.5" /> Ulangi try out
              </button>
            </div>
          </section>
        )}

        {!isLandscape && showQuestionPanel && (
          <button
            aria-label="Tutup panel nomor soal"
            onClick={() => setShowQuestionPanel(false)}
            className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-[1px] landscape:hidden"
          />
        )}

        {!isLandscape && (
          <button
            aria-label={showQuestionPanel ? "Sembunyikan panel nomor soal" : "Tampilkan panel nomor soal"}
            aria-expanded={showQuestionPanel}
            aria-controls="question-navigation-panel"
            onClick={() => setShowQuestionPanel((visible) => !visible)}
            className="fixed left-3 top-20 z-50 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/35 bg-slate-950/90 text-cyan-100 shadow-xl shadow-cyan-950/30 backdrop-blur transition hover:border-cyan-200/70 hover:bg-cyan-500/20 landscape:hidden"
            title={showQuestionPanel ? "Sembunyikan daftar soal" : "Tampilkan daftar soal"}
          >
            {showQuestionPanel ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}

        <div className="grid gap-4 landscape:grid-cols-[190px_minmax(0,1fr)]">
          <aside
            id="question-navigation-panel"
            className={`h-fit rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl shadow-black/30 backdrop-blur landscape:sticky landscape:top-4 ${
              isLandscape
                ? "relative order-1 block"
                : showQuestionPanel
                  ? "fixed left-3 top-20 z-40 block max-h-[calc(100vh-6rem)] w-[min(260px,calc(100vw-1.5rem))] overflow-y-auto"
                  : "hidden"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Daftar soal</p>
                <p className="mt-1 text-xs text-white/70">{answeredCount} / {QUESTIONS.length} terjawab</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                {!isLandscape && (
                  <button
                    aria-label="Tutup panel nomor soal"
                    onClick={() => setShowQuestionPanel(false)}
                    className="rounded-md p-1 text-white/55 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-5">
              {QUESTIONS.map((item, index) => {
                const isAnswered = answers[item.number] !== undefined;
                const isCurrent = index === current;
                return (
                  <button
                    key={item.number}
                    onClick={() => goTo(index)}
                    aria-label={`Buka soal ${item.number}`}
                    className={`relative flex h-8 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                      isAnswered
                        ? "border-emerald-300/60 bg-emerald-500/25 text-emerald-200"
                        : "border-white/10 bg-white/5 text-white/45 hover:border-cyan-300/40 hover:text-cyan-200"
                    } ${isCurrent ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950" : ""}`}
                  >
                    {item.number}
                    {isAnswered && <CheckCircle2 className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-slate-950 text-emerald-300" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 hidden border-t border-white/10 pt-3 text-[10px] text-white/40 lg:block">
              <p className="mb-1 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Sudah dijawab</p>
              <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/20" /> Belum dijawab</p>
            </div>
          </aside>

          <section className="order-1 min-w-0 landscape:order-2">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-xs backdrop-blur sm:px-4">
              <span className="font-bold text-cyan-200">Soal {question.number}</span>
              <span className="text-white/40">{question.topic}</span>
            </div>

            <article
              onContextMenu={security.blockQuestionInteraction}
              className="min-h-[430px] select-none rounded-2xl border border-cyan-300/20 bg-slate-950/75 p-5 shadow-2xl shadow-cyan-950/15 backdrop-blur sm:p-7"
            >
              <div className="mb-6 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 font-display text-sm font-bold text-cyan-200 ring-1 ring-cyan-300/25">
                  {question.number}
                </span>
                <div className="pt-1 text-sm leading-7 text-white/90 sm:text-base">{question.prompt}</div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {question.options.map((option, index) => {
                  const selected = answers[question.number] === index;
                  return (
                    <button
                      key={option}
                       disabled={submitted}
                      onClick={() => chooseAnswer(index)}
                      className={`flex min-h-14 items-center rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                        selected
                          ? "border-cyan-300/70 bg-cyan-400/20 text-cyan-100 shadow-lg shadow-cyan-950/20"
                          : "border-white/10 bg-white/[0.04] text-white/75 hover:border-cyan-300/40 hover:bg-cyan-400/10"
                      } ${submitted ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className={`mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${selected ? "border-cyan-200 bg-cyan-300 text-slate-950" : "border-white/20 text-white/45"}`}>
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span>{option.slice(3)}</span>
                      {selected && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-cyan-200" />}
                    </button>
                  );
                })}
              </div>
            </article>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                disabled={current === 0}
                onClick={() => goTo(current - 1)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/70 transition hover:border-cyan-300/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" /> Sebelumnya
              </button>
              <div className="order-first flex items-center justify-center gap-1 text-[10px] text-white/35 sm:order-none">
                <span>{current + 1}</span><span>/</span><span>{QUESTIONS.length}</span>
              </div>
              <button
                disabled={current === QUESTIONS.length - 1}
                onClick={() => goTo(current + 1)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500/20 px-4 py-3 text-xs font-bold text-cyan-100 ring-1 ring-cyan-300/30 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Selanjutnya <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {!submitted && current === QUESTIONS.length - 1 && (
              <button
                onClick={() => setShowSubmitDialog(true)}
                 disabled={submissionState === "saving"}
                 className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-70"
              >
                 {submissionState === "saving"
                   ? language === "en"
                     ? "Saving answers..."
                     : language === "ja"
                       ? "解答を保存中..."
                       : "Menyimpan jawaban..."
                   : <><Send className="h-4 w-4" /> Selesai dan kumpulkan jawaban</>}
              </button>
            )}
          </section>
        </div>
      </main>

      {showSubmitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-slate-900 p-5 shadow-2xl shadow-black/40">
            <div className="mb-4 flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
              <div>
                <h2 className="font-display text-lg font-bold text-white">Kumpulkan try out?</h2>
                <p className="mt-1 text-sm leading-6 text-white/60">
                  {QUESTIONS.length - answeredCount > 0
                    ? `Masih ada ${QUESTIONS.length - answeredCount} soal yang belum dijawab.`
                    : "Semua soal sudah dijawab."}
                  {" "}Setelah dikumpulkan, jawaban tidak dapat diubah.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSubmitDialog(false)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/70 hover:bg-white/10">Kembali</button>
               <button
                 onClick={submitExam}
                 disabled={submissionState === "saving"}
                 className="flex-1 rounded-xl bg-amber-500/20 px-4 py-3 text-xs font-bold text-amber-100 ring-1 ring-amber-300/40 hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-60"
               >
                 {submissionState === "saving"
                   ? language === "en"
                     ? "Saving answers..."
                     : language === "ja"
                       ? "解答を保存中..."
                       : "Menyimpan jawaban..."
                   : "Ya, kumpulkan"}
               </button>
            </div>
          </div>
        </div>
      )}

      <SecureExamDialog
        open={security.dialogOpen}
        violations={security.violations}
        copy={security.copy}
        onReturn={() => { void security.returnToExam(); }}
        onOpenChange={() => undefined}
      />

      {stage !== "exam" && (
        <button
          onClick={() => navigate("/tka")}
          className="relative z-10 mx-auto mb-8 flex items-center gap-2 text-xs text-white/40 transition hover:text-cyan-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke menu TKA
        </button>
      )}
    </div>
  );
};

export default TKATryOut1Page;
