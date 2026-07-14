import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminUpdateSectionDraft, adminPublishSection } from "@/lib/site-management.functions";
import {
  EditorShell,
  Field,
  TwoCol,
  Repeater,
  IconPicker,
  MediaPickerButton,
  useDraft,
  deepEqual,
} from "./primitives";

const SECTIONS_KEY = ["admin-sections"] as const;

type Section = {
  id: string;
  section_key: string;
  position: number;
  visible: boolean;
  published_content: Record<string, unknown>;
  draft_content: Record<string, unknown>;
  published_at: string | null;
};

function useSectionMutations(sectionKey: string) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (draftContent: unknown) =>
      adminUpdateSectionDraft({ data: { sectionKey, draftContent } }),
    onSuccess: () => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: SECTIONS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const publish = useMutation({
    mutationFn: () => adminPublishSection({ data: { sectionKey } }),
    onSuccess: () => {
      toast.success("Published — live on the site");
      qc.invalidateQueries({ queryKey: SECTIONS_KEY });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { save, publish };
}

// =================== HERO ===================

type CTA = { label: string; href: string };
type HeroDraft = {
  eyebrow: string;
  heading: string;
  subheading: string;
  description: string;
  image_url: string | null;
  primary_cta: CTA;
  secondary_cta: CTA;
  floating_cards?: Array<{ title: string; subtitle: string; icon: string }>;
};

const HERO_DEFAULT: HeroDraft = {
  eyebrow: "",
  heading: "",
  subheading: "",
  description: "",
  image_url: null,
  primary_cta: { label: "", href: "" },
  secondary_cta: { label: "", href: "" },
  floating_cards: [],
};

export function HeroEditor({ section }: { section: Section }) {
  const initial: HeroDraft = { ...HERO_DEFAULT, ...(section.draft_content as Partial<HeroDraft>) };
  const { value, setField, setValue } = useDraft<HeroDraft>(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);

  return (
    <EditorShell
      title="Hero section"
      description="The big banner at the top of the homepage."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      <Field label="Eyebrow (small label above heading)">
        <Input value={value.eyebrow} onChange={(e) => setField("eyebrow", e.target.value)} />
      </Field>
      <TwoCol>
        <Field label="Main heading">
          <Input value={value.heading} onChange={(e) => setField("heading", e.target.value)} />
        </Field>
        <Field label="Sub-heading">
          <Input
            value={value.subheading}
            onChange={(e) => setField("subheading", e.target.value)}
          />
        </Field>
      </TwoCol>
      <Field label="Description" hint="One or two sentences shown under the heading.">
        <Textarea
          value={value.description}
          rows={3}
          onChange={(e) => setField("description", e.target.value)}
        />
      </Field>
      <MediaPickerButton
        label="Hero image"
        value={value.image_url}
        onChange={(url) => setField("image_url", url)}
      />
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold">Primary button</p>
        <TwoCol>
          <Field label="Button text">
            <Input
              value={value.primary_cta.label}
              onChange={(e) =>
                setField("primary_cta", { ...value.primary_cta, label: e.target.value })
              }
            />
          </Field>
          <Field label="Button link" hint="Internal path like /signup or full URL">
            <Input
              value={value.primary_cta.href}
              onChange={(e) =>
                setField("primary_cta", { ...value.primary_cta, href: e.target.value })
              }
            />
          </Field>
        </TwoCol>
      </div>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold">Secondary button</p>
        <TwoCol>
          <Field label="Button text">
            <Input
              value={value.secondary_cta.label}
              onChange={(e) =>
                setField("secondary_cta", { ...value.secondary_cta, label: e.target.value })
              }
            />
          </Field>
          <Field label="Button link">
            <Input
              value={value.secondary_cta.href}
              onChange={(e) =>
                setField("secondary_cta", { ...value.secondary_cta, href: e.target.value })
              }
            />
          </Field>
        </TwoCol>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold">Floating cards (optional)</p>
        <Repeater
          items={value.floating_cards ?? []}
          onChange={(items) => setValue({ ...value, floating_cards: items })}
          newItem={() => ({ title: "", subtitle: "", icon: "Sparkles" })}
          addLabel="Add floating card"
          max={4}
          renderItem={(item, update) => (
            <>
              <TwoCol>
                <Field label="Title">
                  <Input value={item.title} onChange={(e) => update({ title: e.target.value })} />
                </Field>
                <Field label="Subtitle">
                  <Input
                    value={item.subtitle}
                    onChange={(e) => update({ subtitle: e.target.value })}
                  />
                </Field>
              </TwoCol>
              <Field label="Icon">
                <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
              </Field>
            </>
          )}
        />
      </div>
    </EditorShell>
  );
}

// =================== STATS ===================

type StatsDraft = { items: Array<{ label: string; value: string }> };

export function StatsEditor({ section }: { section: Section }) {
  const initial: StatsDraft = { items: [], ...(section.draft_content as Partial<StatsDraft>) };
  const { value, setValue } = useDraft<StatsDraft>(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);

  return (
    <EditorShell
      title="Stats section"
      description="Big numbers shown under the hero (students, MCQs, mock attempts…)."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      <Repeater
        items={value.items}
        onChange={(items) => setValue({ items })}
        newItem={() => ({ label: "", value: "" })}
        addLabel="Add stat"
        max={8}
        renderItem={(item, update) => (
          <TwoCol>
            <Field label="Number / value" hint='e.g. "2K+", "500"'>
              <Input value={item.value} onChange={(e) => update({ value: e.target.value })} />
            </Field>
            <Field label="Label" hint='e.g. "CA Students"'>
              <Input value={item.label} onChange={(e) => update({ label: e.target.value })} />
            </Field>
          </TwoCol>
        )}
      />
    </EditorShell>
  );
}

// =================== FEATURES ===================

type FeaturesDraft = { items: Array<{ icon: string; title: string; description: string }> };

export function FeaturesEditor({ section }: { section: Section }) {
  const initial: FeaturesDraft = {
    items: [],
    ...(section.draft_content as Partial<FeaturesDraft>),
  };
  const { value, setValue } = useDraft<FeaturesDraft>(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);

  return (
    <EditorShell
      title="Features section"
      description="Feature cards highlighting what the platform offers."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      <Repeater
        items={value.items}
        onChange={(items) => setValue({ items })}
        newItem={() => ({ icon: "Sparkles", title: "", description: "" })}
        addLabel="Add feature"
        max={12}
        renderItem={(item, update) => (
          <>
            <TwoCol>
              <Field label="Icon">
                <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
              </Field>
              <Field label="Title">
                <Input value={item.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
            </TwoCol>
            <Field label="Description">
              <Textarea
                rows={2}
                value={item.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
          </>
        )}
      />
    </EditorShell>
  );
}

// =================== TESTIMONIALS ===================

type TestimonialsDraft = {
  items: Array<{ name: string; role: string; quote: string; avatar_url: string | null }>;
};

export function TestimonialsEditor({ section }: { section: Section }) {
  const initial: TestimonialsDraft = {
    items: [],
    ...(section.draft_content as Partial<TestimonialsDraft>),
  };
  const { value, setValue } = useDraft<TestimonialsDraft>(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);

  return (
    <EditorShell
      title="Testimonials"
      description="Student / member quotes shown on the homepage."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      <Repeater
        items={value.items}
        onChange={(items) => setValue({ items })}
        newItem={() => ({ name: "", role: "", quote: "", avatar_url: null })}
        addLabel="Add testimonial"
        max={12}
        renderItem={(item, update) => (
          <>
            <TwoCol>
              <Field label="Name">
                <Input value={item.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Role / level">
                <Input value={item.role} onChange={(e) => update({ role: e.target.value })} />
              </Field>
            </TwoCol>
            <Field label="Quote">
              <Textarea
                rows={3}
                value={item.quote}
                onChange={(e) => update({ quote: e.target.value })}
              />
            </Field>
            <MediaPickerButton
              label="Avatar"
              value={item.avatar_url}
              onChange={(url) => update({ avatar_url: url })}
            />
          </>
        )}
      />
    </EditorShell>
  );
}

// =================== FAQ ===================

type FaqDraft = { items: Array<{ question: string; answer: string }> };

export function FaqEditor({ section }: { section: Section }) {
  const initial: FaqDraft = { items: [], ...(section.draft_content as Partial<FaqDraft>) };
  const { value, setValue } = useDraft<FaqDraft>(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);

  return (
    <EditorShell
      title="Frequently asked questions"
      description="Questions and answers shown in the FAQ section."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      <Repeater
        items={value.items}
        onChange={(items) => setValue({ items })}
        newItem={() => ({ question: "", answer: "" })}
        addLabel="Add question"
        max={30}
        renderItem={(item, update) => (
          <>
            <Field label="Question">
              <Input value={item.question} onChange={(e) => update({ question: e.target.value })} />
            </Field>
            <Field label="Answer">
              <Textarea
                rows={3}
                value={item.answer}
                onChange={(e) => update({ answer: e.target.value })}
              />
            </Field>
          </>
        )}
      />
    </EditorShell>
  );
}

// =================== CTA ===================

type CtaDraft = {
  heading: string;
  subheading: string;
  primary_cta: CTA;
  secondary_cta: CTA;
};

export function CtaEditor({ section }: { section: Section }) {
  const initial: CtaDraft = {
    heading: "",
    subheading: "",
    primary_cta: { label: "", href: "" },
    secondary_cta: { label: "", href: "" },
    ...(section.draft_content as Partial<CtaDraft>),
  };
  const { value, setField } = useDraft<CtaDraft>(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);

  return (
    <EditorShell
      title="Call-to-action banner"
      description="The conversion banner at the bottom of the homepage."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      <Field label="Heading">
        <Input value={value.heading} onChange={(e) => setField("heading", e.target.value)} />
      </Field>
      <Field label="Sub-heading">
        <Textarea
          rows={2}
          value={value.subheading}
          onChange={(e) => setField("subheading", e.target.value)}
        />
      </Field>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold">Primary button</p>
        <TwoCol>
          <Field label="Text">
            <Input
              value={value.primary_cta.label}
              onChange={(e) =>
                setField("primary_cta", { ...value.primary_cta, label: e.target.value })
              }
            />
          </Field>
          <Field label="Link">
            <Input
              value={value.primary_cta.href}
              onChange={(e) =>
                setField("primary_cta", { ...value.primary_cta, href: e.target.value })
              }
            />
          </Field>
        </TwoCol>
      </div>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold">Secondary button</p>
        <TwoCol>
          <Field label="Text">
            <Input
              value={value.secondary_cta.label}
              onChange={(e) =>
                setField("secondary_cta", { ...value.secondary_cta, label: e.target.value })
              }
            />
          </Field>
          <Field label="Link">
            <Input
              value={value.secondary_cta.href}
              onChange={(e) =>
                setField("secondary_cta", { ...value.secondary_cta, href: e.target.value })
              }
            />
          </Field>
        </TwoCol>
      </div>
    </EditorShell>
  );
}

// =================== Generic fallback (unknown section_key) ===================

export function GenericKeyValueEditor({ section }: { section: Section }) {
  const initial = section.draft_content as Record<string, unknown>;
  const { value, setValue } = useDraft(initial, section.section_key);
  const { save, publish } = useSectionMutations(section.section_key);
  const dirty =
    !deepEqual(value, section.draft_content) ||
    !deepEqual(section.draft_content, section.published_content);
  const entries = Object.entries(value);

  return (
    <EditorShell
      title={`Section: ${section.section_key}`}
      description="Custom section. Edit each field individually."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={section.published_at}
    >
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">This section has no fields yet.</p>
      )}
      {entries.map(([k, v]) => (
        <Field key={k} label={k}>
          {typeof v === "string" || typeof v === "number" ? (
            <Input
              value={String(v ?? "")}
              onChange={(e) => setValue({ ...value, [k]: e.target.value })}
            />
          ) : (
            <Textarea
              rows={4}
              className="font-mono text-xs"
              value={JSON.stringify(v, null, 2)}
              onChange={(e) => {
                try {
                  setValue({ ...value, [k]: JSON.parse(e.target.value) });
                } catch {
                  /* ignore until valid */
                }
              }}
            />
          )}
        </Field>
      ))}
    </EditorShell>
  );
}

// =================== Resolver ===================

export function SectionEditorByKey({ section }: { section: Section }) {
  switch (section.section_key) {
    case "hero":
      return <HeroEditor section={section} />;
    case "stats":
      return <StatsEditor section={section} />;
    case "features":
      return <FeaturesEditor section={section} />;
    case "testimonials":
      return <TestimonialsEditor section={section} />;
    case "faq":
      return <FaqEditor section={section} />;
    case "cta":
      return <CtaEditor section={section} />;
    default:
      return <GenericKeyValueEditor section={section} />;
  }
}
