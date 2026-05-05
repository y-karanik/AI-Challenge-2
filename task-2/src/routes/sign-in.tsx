import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

const SearchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/sign-in")({
  validateSearch: (s) => SearchSchema.parse(s),
  component: SignIn,
  head: () => ({
    meta: [
      { title: "Sign in — Gather" },
      { name: "description", content: "Sign in to host events or RSVP." },
    ],
  }),
});

const EmailSchema = z.object({ email: z.string().email("Enter a valid email address") });
type EmailValues = z.infer<typeof EmailSchema>;

function SignIn() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [sent, setSent] = React.useState(false);
  const safeRedirect = React.useMemo(() => {
    // Only allow same-origin paths
    if (!redirect || !redirect.startsWith("/")) return "/";
    return redirect;
  }, [redirect]);

  React.useEffect(() => {
    if (loading || !user) return;
    // After auth resolves, send brand-new users (no display_name yet) through onboarding.
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      const needsOnboarding = !data?.display_name;
      navigate({ to: needsOnboarding ? "/onboarding" : safeRedirect, replace: true });
    })();
  }, [loading, user, safeRedirect, navigate]);

  const form = useForm<EmailValues>({ resolver: zodResolver(EmailSchema), defaultValues: { email: "" } });

  const onMagicLink = form.handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${safeRedirect}` },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Check your inbox for a magic link.");
  });

  const onGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${safeRedirect}`,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: safeRedirect, replace: true });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md py-6">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <span className="text-sm font-medium text-muted-foreground">Welcome to Gather</span>
        </div>
        <PageHeader
          title="Sign in"
          description="Use a magic link or your Google account. No passwords to remember."
        />

        <div className="mt-8 space-y-6">
          <Button onClick={onGoogle} variant="outline" className="w-full" size="lg">
            Continue with Google
          </Button>

          <div className="relative text-center text-xs uppercase tracking-wider text-muted-foreground">
            <span className="bg-background px-3 relative z-10">or email me a link</span>
            <span className="absolute inset-x-0 top-1/2 -z-0 border-t border-border" aria-hidden />
          </div>

          {sent ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <p className="font-medium text-card-foreground">Magic link sent.</p>
              <p className="mt-1 text-muted-foreground">
                Open the email on this device and tap the link. You can close this tab.
              </p>
            </div>
          ) : (
            <form onSubmit={onMagicLink} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <p role="alert" className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sending…" : "Email me a magic link"}
              </Button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            By continuing you agree to use Gather respectfully.{" "}
            <Link to="/" className="underline underline-offset-2">Back home</Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
