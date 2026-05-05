import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Set up your profile — Gather" },
      { name: "description", content: "Add your name and photo so hosts and attendees can recognize you." },
    ],
  }),
});

const Schema = z.object({
  display_name: z.string().min(2, "At least 2 characters").max(60),
  avatar_url: z.string().url("Must be a URL").or(z.literal("")).optional(),
});
type Values = z.infer<typeof Schema>;

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { display_name: "", avatar_url: "" },
  });

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      form.reset({
        display_name: data?.display_name ?? (user.user_metadata?.full_name as string | undefined) ?? "",
        avatar_url: data?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? "",
      });
      setLoading(false);
    })();
  }, [user, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: values.display_name.trim(),
      avatar_url: values.avatar_url?.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved.");
    navigate({ to: "/explore" });
  });

  const avatar = form.watch("avatar_url");
  const name = form.watch("display_name");
  const initial = name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <PageHeader
          title="Tell us your name"
          description="This is how hosts and other attendees will see you on Gather."
        />
        <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatar || undefined} alt="" />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="text-sm text-muted-foreground">A photo helps people recognize you at events.</div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              autoComplete="name"
              placeholder="Alex Rivera"
              aria-invalid={!!form.formState.errors.display_name}
              {...form.register("display_name")}
            />
            {form.formState.errors.display_name ? (
              <p role="alert" className="text-xs text-destructive">{form.formState.errors.display_name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="avatar_url">Avatar URL (optional)</Label>
            <Input
              id="avatar_url"
              type="url"
              placeholder="https://…"
              aria-invalid={!!form.formState.errors.avatar_url}
              {...form.register("avatar_url")}
            />
            {form.formState.errors.avatar_url ? (
              <p role="alert" className="text-xs text-destructive">{form.formState.errors.avatar_url.message}</p>
            ) : null}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
