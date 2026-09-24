import { signIn } from "@/auth";

/** Google ile giriş düğmesi — /giris ve /davet sayfaları paylaşır. */
export function GoogleSignInButton({ label = "Google ile giriş yap" }: { label?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4
                   font-display font-black text-[#1a1a1a] shadow-[0_6px_0_#b9bec7]
                   transition active:translate-y-[4px] active:shadow-[0_2px_0_#b9bec7]"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z"
          />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
          />
        </svg>
        {label}
      </button>
    </form>
  );
}
