import Image from "next/image";

// Temporary home page; replaced by the real landing page in a later phase.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div className="flex items-center gap-3">
        <Image src="/logo.svg" alt="" width={40} height={40} priority />
        <span className="text-2xl font-semibold tracking-tight">Relay</span>
        <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          AI
        </span>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Answers first. Humans when it matters.
      </h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        An embeddable support chatbot for small web shops. Under construction.
      </p>
    </main>
  );
}
