'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/language-switcher";
import { useUiStore } from "@/lib/store/ui-store";
import { useMatrixStore } from "@/lib/store/matrix-store";
import { t } from "@/lib/i18n";

export default function Home() {
  const { language } = useUiStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Auto-redirect if already logged in
  useEffect(() => {
    const check = async () => {
      if (typeof window === 'undefined') { setReady(true); return; }
      const token = localStorage.getItem('matrix_access_token');
      if (token) {
        try {
          const { restoreSession } = useMatrixStore.getState();
          await restoreSession();
          const user = useMatrixStore.getState().currentUser;
          if (user) {
            router.replace('/chat');
            return;
          }
        } catch { /* session expired */ }
      }
      setReady(true);
    };
    check();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 via-white to-sky-100 dark:from-[#060b12] dark:via-[#0b1420] dark:to-black">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] items-center justify-items-center gap-6 bg-gradient-to-b from-sky-50 via-white to-sky-100 p-6 pb-16 font-sans dark:from-[#060b12] dark:via-[#0b1420] dark:to-black sm:p-20">
      <header className="w-full flex items-center justify-center absolute top-0 left-0 right-0 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-col gap-4 row-start-2 items-center text-center">
        <div className="flex items-center gap-4 sm:gap-6">
          <Image src="/PieChatIcon.png" alt="PieChat" width={96} height={96} className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl shadow-xl" />
          <h1 className="text-4xl sm:text-6xl lg:text-8xl font-extrabold tracking-tighter text-sky-700 dark:text-sky-300 italic">
            PieChat
          </h1>
        </div>
        <p className="text-base text-gray-600 dark:text-gray-400 max-w-md px-4">
          {t(language, 'homeDescription')}
        </p>

        <div className="flex gap-3 items-center w-full max-w-xs mt-2 px-4">
          <Link
            className="flex-1 flex h-12 items-center justify-center rounded-2xl bg-sky-600 text-base font-bold text-white shadow-lg hover:bg-sky-700 transition-all active:scale-95 dark:bg-sky-500"
            href="/login"
          >
            {t(language, 'homeSignIn')}
          </Link>
          <Link
            className="flex-1 flex h-12 items-center justify-center rounded-2xl border-2 border-sky-500 text-base font-bold text-sky-600 hover:bg-sky-50 transition-all active:scale-95 dark:text-sky-300 dark:border-sky-400 dark:hover:bg-sky-900/20"
            href="/register"
          >
            {t(language, 'homeRegister')}
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          <div className="rounded-xl border border-sky-100 bg-white/70 p-4 dark:border-sky-900/40 dark:bg-[#101a2a]/70">
            <h3 className="text-xl font-semibold mb-2">{t(language, 'homeSecure')}</h3>
            <p className="text-sm text-gray-500">{t(language, 'homeSecureDesc')}</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/70 p-4 dark:border-sky-900/40 dark:bg-[#101a2a]/70">
            <h3 className="text-xl font-semibold mb-2">{t(language, 'homeDecentralized')}</h3>
            <p className="text-sm text-gray-500">{t(language, 'homeDecentralizedDesc')}</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/70 p-4 dark:border-sky-900/40 dark:bg-[#101a2a]/70">
            <h3 className="text-xl font-semibold mb-2">{t(language, 'homeOpenSource')}</h3>
            <p className="text-sm text-gray-500">{t(language, 'homeOpenSourceDesc')}</p>
          </div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} PieChat. All rights reserved.</p>
      </footer>
    </div>
  );
}
