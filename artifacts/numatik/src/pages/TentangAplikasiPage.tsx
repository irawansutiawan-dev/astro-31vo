import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Monitor } from "lucide-react";
import Starfield from "@/components/Starfield";
import PageNavigation from "@/components/PageNavigation";
import { useNavigate } from "react-router-dom";
import { playPopSound } from "@/hooks/useAudio";
import { useTheme } from "@/contexts/ThemeContext";

const TentangAplikasiPage = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-screen flex flex-col items-center gradient-space overflow-hidden">
      <Starfield />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-cyan-300 rounded-full"
            style={{
              top: `${Math.random() * 50}%`,
              left: `${Math.random() * 100}%`,
              animation: `shootingStar ${3 + Math.random() * 3}s linear infinite`,
              animationDelay: `${i * 2}s`,
              boxShadow: '0 0 10px 2px rgba(34, 211, 238, 0.6)'
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes shootingStar {
          0% { transform: translateX(0) translateY(0); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateX(300px) translateY(300px); opacity: 0; }
        }
      `}</style>

      <PageNavigation />

      <div className="relative z-10 max-w-4xl w-full px-4 py-10">
        <div className="text-center mb-8 animate-scale-in">
          <h1 className="font-display text-3xl md:text-4xl font-black text-primary text-glow-cyan mb-2">
            NUMATIK
          </h1>
          <p className="text-accent font-body text-sm">
            {t("tentang.subtitle")}
          </p>
        </div>

        <div className="bg-card/80 backdrop-blur border border-border rounded-xl p-6 md:p-8 mb-6 animate-slide-up">
          <div className="space-y-4">
            <p className="text-white font-body text-sm md:text-base leading-relaxed text-justify">
              <Trans
                i18nKey="tentang.desc1"
                components={{
                  boldPrimary: <strong className="text-primary" />,
                  boldAccent: <strong className="text-accent" />,
                }}
              />
            </p>
            <p className="text-white/90 font-body text-sm md:text-base leading-relaxed text-justify">
              <Trans
                i18nKey="tentang.desc2"
                components={{
                  boldPrimary: <strong className="text-primary" />,
                  boldAccent: <strong className="text-accent" />,
                  boldSecondary: <strong className="text-secondary" />,
                }}
              />
            </p>
            <p className="text-white/80 font-body text-sm md:text-base leading-relaxed text-justify">
              {t("tentang.desc3")}
            </p>
          </div>
        </div>

        <div className="animate-slide-up mb-6" style={{ animationDelay: '0.35s' }}>
          <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 shadow-[0_0_30px_rgba(0,200,255,0.2)]">
            <div className={`rounded-2xl px-6 py-4 flex items-center gap-4 ${isDark ? "bg-[#0d0d2b]" : "bg-white/90"}`}>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 overflow-hidden">
                <img src="/logo-numatik-pi.jpeg" alt="NUMATIK" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1">
                <p className="font-display text-xs font-bold tracking-widest uppercase text-cyan-400 mb-0.5">{t("tentang.versionLabel")}</p>
                <p className="font-display text-lg font-black text-white">
                  Numatik Versi 2.2
                </p>
                <p className="text-white/50 font-body text-xs mt-0.5">{t("tentang.versionUpdateNote")}</p>
              </div>
              <div className="shrink-0">
                <span className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 font-display tracking-wide">
                  {t("tentang.versionBadge")}
                </span>
              </div>
            </div>
          </div>
        </div>


        {/* ── Desktop access info ─────────────────────────────────── */}
        <div className="animate-slide-up mb-6" style={{ animationDelay: '0.38s' }}>
          <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-cyan-400 via-teal-500 to-blue-500 shadow-[0_0_24px_rgba(6,182,212,0.18)]">
            <div className={`rounded-2xl px-6 py-5 flex items-center gap-4 ${isDark ? "bg-[#0a1f2e]" : "bg-white/90"}`}>
              <div
                className="shrink-0 flex items-center justify-center w-12 h-12 rounded-xl border"
                style={{
                  background: "linear-gradient(135deg, rgba(6,182,212,0.25), rgba(59,130,246,0.20))",
                  borderColor: "rgba(6,182,212,0.45)",
                  boxShadow: "0 0 14px rgba(6,182,212,0.25)",
                }}
              >
                <Monitor className="w-6 h-6 text-cyan-300" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-xs font-bold tracking-widest uppercase text-cyan-400 mb-0.5">
                  {t("tentang.desktopLabel")}
                </p>
                <p className="font-display text-base font-black text-white leading-snug">
                  {t("tentang.desktopTitle")}
                </p>
                <p className="font-body text-xs text-white/60 mt-1 leading-relaxed">
                  <Trans
                    i18nKey="tentang.desktopDesc"
                    components={{
                      link: <a href="https://www.numatik.app" target="_blank" rel="noopener noreferrer" className="text-cyan-300 font-semibold underline underline-offset-2 hover:text-cyan-200 transition-colors" />,
                    }}
                  />
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center space-y-2 animate-slide-up" style={{ animationDelay: '0.40s' }}>
          <p className="text-white/40 font-body text-xs">
            {t("tentang.copyright")}
          </p>
        </div>

        <button
          onClick={() => { playPopSound(); navigate("/menu"); }}
          className="mt-6 block mx-auto text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer font-body"
        >
          {t("tentang.backToMenu")}
        </button>
      </div>
    </div>
  );
};

export default TentangAplikasiPage;
