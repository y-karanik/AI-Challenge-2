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
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { slugify, SLUG_RE } from "@/lib/slug";
import { checkHostSlug, createHost } from "@/server/hosts.functions";

export const Route = createFileRoute("/become-a-host")({
  component: () => (
    <RequireAuth>
      <BecomeHost />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Become a host — Gather" },
      { name: "description", content: "Create a host profile to start publishing free events on Gather." },
    ],
  }),
});

const Schema = z.object({
  name: z.string().min(2, "At least 2 characters").max(80),
  slug: z.string().regex(SLUG_RE, "Lowercase letters, numbers, and dashes (3–40 chars)."),
  bio: z.string().max(500).optional(),
  contact_email: z.string().email("Enter a valid email").optional().or(z.literal("")),
});
type Values = z.infer<typeof Schema>;

function BecomeHost() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [slugStatus, setSlugStatus] = React.useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { name: "", slug: "", bio: "", contact_email: "" },
  });

  const name = form.watch("name");
  const slug = form.watch("slug");
  const slugTouchedRef = React.useRef(false);

  React.useEffect(() => {
    if (slugTouchedRef.current) return;
    if (name) form.setValue("slug", slugify(name), { shouldValidate: false });
  }, [name, form]);

  React.useEffect(() => {
    if (!slug) return setSlugStatus("idle");
    if (!SLUG_RE.test(slug)) return setSlugStatus("invalid");
    setSlugStatus("checking");
    const t = setTimeout(async () => {
      const r = await checkHostSlug({ data: { slug } });
      setSlugStatus(r.available ? "ok" : r.reason === "taken" ? "taken" : "invalid");
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  const onLogo = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("host-logos").upload(path, file, { upsert: false });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("host-logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    setUploading(false);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    if (slugStatus === "taken") return toast.error("That slug is taken.");
    try {
      const host = await createHost({
        data: {
          name: vals.name,
          slug: vals.slug,
          bio: vals.bio || null,
          logo_url: logoUrl,
          contact_email: vals.contact_email || null,
        },
      });
      toast.success("Host created!");
      navigate({ to: "/my-events" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create host");
    }
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Become a host" description="Create your public host profile. You can edit anything later." />

        <form onSubmit={onSubmit} className="mt-8 space-y-6" noValidate>
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={logoUrl ?? undefined} alt="" />
              <AvatarFallback>{(name?.[0] ?? "H").toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="logo">Logo</Label>
              <Input
                id="logo"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
                disabled={uploading}
              />
              <p className="mt-1 text-xs text-muted-foreground">Square image works best.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Host name</Label>
            <Input id="name" {...form.register("name")} placeholder="Maple Coffee Club" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">gather.app/h/</span>
              <Input
                id="slug"
                {...form.register("slug", {
                  onChange: () => {
                    slugTouchedRef.current = true;
                  },
                })}
                placeholder="maple-coffee"
              />
            </div>
            <p className="text-xs">
              {slugStatus === "checking" && <span className="text-muted-foreground">Checking…</span>}
              {slugStatus === "ok" && <span className="text-primary">Available ✓</span>}
              {slugStatus === "taken" && <span className="text-destructive">Slug already in use</span>}
              {slugStatus === "invalid" && (
                <span className="text-destructive">Lowercase, numbers, dashes (3–40 chars)</span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Short bio</Label>
            <Textarea id="bio" {...form.register("bio")} rows={4} placeholder="What kind of events do you host?" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact_email">Contact email (optional)</Label>
            <Input id="contact_email" type="email" {...form.register("contact_email")} placeholder="hello@you.com" />
            {form.formState.errors.contact_email && (
              <p className="text-xs text-destructive">{form.formState.errors.contact_email.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="submit"
              size="lg"
              disabled={form.formState.isSubmitting || slugStatus === "taken" || slugStatus === "invalid"}
            >
              {form.formState.isSubmitting ? "Creating…" : "Create host"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
