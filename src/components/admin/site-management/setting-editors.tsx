import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminUpdateSettingDraft, adminPublishSetting } from "@/lib/site-management.functions";
import {
  EditorShell,
  Field,
  TwoCol,
  Repeater,
  ColorField,
  MediaPickerButton,
  useDraft,
  deepEqual,
} from "./primitives";

const SETTINGS_KEY = ["admin-settings"] as const;

type SettingRow = {
  key: string;
  published_value: Record<string, unknown>;
  draft_value: Record<string, unknown>;
  published_at: string | null;
};

function useSettingMutations(settingKey: string) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (draftValue: unknown) =>
      adminUpdateSettingDraft({ data: { key: settingKey, draftValue } }),
    onSuccess: () => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const publish = useMutation({
    mutationFn: () => adminPublishSetting({ data: { key: settingKey } }),
    onSuccess: () => {
      toast.success("Published — live on the site");
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { save, publish };
}

// =================== THEME ===================

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter (modern sans)" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans" },
  { value: "Space Grotesk", label: "Space Grotesk" },
  { value: "Manrope", label: "Manrope" },
  { value: "Outfit", label: "Outfit" },
  { value: "DM Sans", label: "DM Sans" },
  { value: "Sora", label: "Sora" },
  { value: "Poppins", label: "Poppins" },
  { value: "Work Sans", label: "Work Sans" },
];

const BUTTON_STYLES = [
  { value: "rounded", label: "Rounded" },
  { value: "pill", label: "Pill (fully round)" },
  { value: "square", label: "Square" },
];

type ThemeDraft = {
  brand_primary: string;
  brand_secondary: string;
  brand_accent: string;
  background: string;
  foreground: string;
  font_display: string;
  font_body: string;
  radius: number; // px
  button_style: string;
  gradient_cta: string;
};

const THEME_DEFAULT: ThemeDraft = {
  brand_primary: "#6366f1",
  brand_secondary: "#8b5cf6",
  brand_accent: "#f59e0b",
  background: "#ffffff",
  foreground: "#0f172a",
  font_display: "Plus Jakarta Sans",
  font_body: "Inter",
  radius: 12,
  button_style: "rounded",
  gradient_cta: "linear-gradient(135deg, #6366f1, #8b5cf6)",
};

export function ThemeEditor({ row }: { row: SettingRow }) {
  const initial = { ...THEME_DEFAULT, ...(row.draft_value as Partial<ThemeDraft>) };
  const { value, setField } = useDraft<ThemeDraft>(initial, row.key);
  const { save, publish } = useSettingMutations(row.key);
  const dirty =
    !deepEqual(value, row.draft_value) || !deepEqual(row.draft_value, row.published_value);

  return (
    <EditorShell
      title="Theme"
      description="Colors, fonts and shape used across the public site. Dark/light mode keeps working."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={row.published_at}
    >
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Brand colors
        </p>
        <TwoCol>
          <ColorField
            label="Primary"
            value={value.brand_primary}
            onChange={(v) => setField("brand_primary", v)}
          />
          <ColorField
            label="Secondary"
            value={value.brand_secondary}
            onChange={(v) => setField("brand_secondary", v)}
          />
          <ColorField
            label="Accent"
            value={value.brand_accent}
            onChange={(v) => setField("brand_accent", v)}
          />
          <ColorField
            label="Background"
            value={value.background}
            onChange={(v) => setField("background", v)}
          />
          <ColorField
            label="Foreground (text)"
            value={value.foreground}
            onChange={(v) => setField("foreground", v)}
          />
        </TwoCol>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Typography
        </p>
        <TwoCol>
          <Field label="Display font (headings)">
            <Select value={value.font_display} onValueChange={(v) => setField("font_display", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Body font">
            <Select value={value.font_body} onValueChange={(v) => setField("font_body", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </TwoCol>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Shape
        </p>
        <TwoCol>
          <Field label={`Corner radius: ${value.radius}px`}>
            <Slider
              min={0}
              max={32}
              step={1}
              value={[value.radius]}
              onValueChange={(v) => setField("radius", v[0])}
            />
          </Field>
          <Field label="Button style">
            <Select value={value.button_style} onValueChange={(v) => setField("button_style", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUTTON_STYLES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </TwoCol>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          CTA gradient
        </p>
        <Field label="Gradient CSS" hint="e.g. linear-gradient(135deg, #6366f1, #8b5cf6)">
          <Input
            value={value.gradient_cta}
            onChange={(e) => setField("gradient_cta", e.target.value)}
          />
        </Field>
        <div
          className="mt-2 h-12 rounded-xl shadow-inner"
          style={{ background: value.gradient_cta }}
          aria-label="Gradient preview"
        />
      </div>

      <ThemePreview value={value} />
    </EditorShell>
  );
}

function ThemePreview({ value }: { value: ThemeDraft }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Live preview
      </p>
      <div
        className="rounded-xl p-6"
        style={{
          background: value.background,
          color: value.foreground,
          borderRadius: `${value.radius}px`,
          fontFamily: value.font_body,
        }}
      >
        <h3
          className="mb-2 text-2xl font-bold"
          style={{ fontFamily: value.font_display, color: value.brand_primary }}
        >
          Sample heading
        </h3>
        <p className="mb-4 text-sm" style={{ color: value.foreground }}>
          This is body text rendered with your chosen typography and colors.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            style={{
              background: value.gradient_cta,
              color: "white",
              borderRadius:
                value.button_style === "pill"
                  ? "9999px"
                  : value.button_style === "square"
                    ? "4px"
                    : `${value.radius}px`,
              padding: "8px 16px",
              fontFamily: value.font_body,
            }}
          >
            Primary action
          </button>
          <button
            style={{
              background: "transparent",
              color: value.brand_primary,
              border: `1px solid ${value.brand_primary}`,
              borderRadius:
                value.button_style === "pill"
                  ? "9999px"
                  : value.button_style === "square"
                    ? "4px"
                    : `${value.radius}px`,
              padding: "8px 16px",
              fontFamily: value.font_body,
            }}
          >
            Secondary
          </button>
        </div>
      </div>
    </div>
  );
}

// =================== NAVBAR ===================

type NavbarDraft = {
  brand_primary: string;
  brand_secondary: string;
  tagline: string;
  logo_url: string | null;
  cta: { label: string; href: string };
  links: Array<{ label: string; href: string }>;
};

const NAVBAR_DEFAULT: NavbarDraft = {
  brand_primary: "CA",
  brand_secondary: "Aspire",
  tagline: "",
  logo_url: null,
  cta: { label: "Get Started", href: "/signup" },
  links: [],
};

export function NavbarEditor({ row }: { row: SettingRow }) {
  const initial = { ...NAVBAR_DEFAULT, ...(row.draft_value as Partial<NavbarDraft>) };
  const { value, setField, setValue } = useDraft<NavbarDraft>(initial, row.key);
  const { save, publish } = useSettingMutations(row.key);
  const dirty =
    !deepEqual(value, row.draft_value) || !deepEqual(row.draft_value, row.published_value);

  return (
    <EditorShell
      title="Top navigation"
      description="Logo, brand text and menu items shown in the site header."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={row.published_at}
    >
      <MediaPickerButton
        label="Logo"
        value={value.logo_url}
        onChange={(url) => setField("logo_url", url)}
      />
      <TwoCol>
        <Field label="Brand text (first part)">
          <Input
            value={value.brand_primary}
            onChange={(e) => setField("brand_primary", e.target.value)}
          />
        </Field>
        <Field label="Brand text (second part)">
          <Input
            value={value.brand_secondary}
            onChange={(e) => setField("brand_secondary", e.target.value)}
          />
        </Field>
      </TwoCol>
      <Field label="Tagline (optional)">
        <Input value={value.tagline} onChange={(e) => setField("tagline", e.target.value)} />
      </Field>

      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold">Header CTA button</p>
        <TwoCol>
          <Field label="Text">
            <Input
              value={value.cta.label}
              onChange={(e) => setField("cta", { ...value.cta, label: e.target.value })}
            />
          </Field>
          <Field label="Link">
            <Input
              value={value.cta.href}
              onChange={(e) => setField("cta", { ...value.cta, href: e.target.value })}
            />
          </Field>
        </TwoCol>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">Menu items</p>
        <Repeater
          items={value.links}
          onChange={(links) => setValue({ ...value, links })}
          newItem={() => ({ label: "", href: "" })}
          addLabel="Add menu link"
          max={10}
          renderItem={(item, update) => (
            <TwoCol>
              <Field label="Label">
                <Input value={item.label} onChange={(e) => update({ label: e.target.value })} />
              </Field>
              <Field label="Link">
                <Input value={item.href} onChange={(e) => update({ href: e.target.value })} />
              </Field>
            </TwoCol>
          )}
        />
      </div>
    </EditorShell>
  );
}

// =================== FOOTER ===================

type FooterDraft = {
  brand_primary: string;
  brand_secondary: string;
  brand_eyebrow: string;
  brand_description: string;
  tagline: string;
  copyright: string;
  contact: {
    support_label: string;
    support_email: string;
    sales_label: string;
    sales_email: string;
    hq_label: string;
    hq_value: string;
  };
  columns: Array<{
    title: string;
    links: Array<{ label: string; href: string }>;
  }>;
  social: Array<{ platform: string; href: string }>;
};

const FOOTER_DEFAULT: FooterDraft = {
  brand_primary: "CA Aspire",
  brand_secondary: "BD",
  brand_eyebrow: "ICAB Learning OS",
  brand_description: "",
  tagline: "",
  copyright: `© ${new Date().getFullYear()} CA Aspire BD`,
  contact: {
    support_label: "Support",
    support_email: "help@caaspirebd.xyz",
    sales_label: "Sales",
    sales_email: "sales@caaspirebd.xyz",
    hq_label: "HQ",
    hq_value: "Dhaka",
  },
  columns: [],
  social: [],
};

const SOCIAL_PLATFORMS = [
  "facebook",
  "twitter",
  "instagram",
  "linkedin",
  "youtube",
  "github",
  "tiktok",
];

export function FooterEditor({ row }: { row: SettingRow }) {
  const initial = { ...FOOTER_DEFAULT, ...(row.draft_value as Partial<FooterDraft>) };
  const { value, setField, setValue } = useDraft<FooterDraft>(initial, row.key);
  const { save, publish } = useSettingMutations(row.key);
  const dirty =
    !deepEqual(value, row.draft_value) || !deepEqual(row.draft_value, row.published_value);

  return (
    <EditorShell
      title="Footer"
      description="Footer columns, social links, tagline and copyright."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={row.published_at}
    >
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Brand
        </p>
        <TwoCol>
          <Field label="Brand name (first part)">
            <Input
              value={value.brand_primary}
              onChange={(e) => setField("brand_primary", e.target.value)}
            />
          </Field>
          <Field label="Brand name (second part)">
            <Input
              value={value.brand_secondary}
              onChange={(e) => setField("brand_secondary", e.target.value)}
            />
          </Field>
        </TwoCol>
        <Field label="Brand eyebrow (small uppercase line)">
          <Input
            value={value.brand_eyebrow}
            onChange={(e) => setField("brand_eyebrow", e.target.value)}
          />
        </Field>
        <Field label="Brand description">
          <Textarea
            rows={2}
            value={value.brand_description}
            onChange={(e) => setField("brand_description", e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contact strip
        </p>
        <TwoCol>
          <Field label="Support label">
            <Input
              value={value.contact.support_label}
              onChange={(e) =>
                setField("contact", { ...value.contact, support_label: e.target.value })
              }
            />
          </Field>
          <Field label="Support email">
            <Input
              value={value.contact.support_email}
              onChange={(e) =>
                setField("contact", { ...value.contact, support_email: e.target.value })
              }
            />
          </Field>
          <Field label="Sales label">
            <Input
              value={value.contact.sales_label}
              onChange={(e) =>
                setField("contact", { ...value.contact, sales_label: e.target.value })
              }
            />
          </Field>
          <Field label="Sales email">
            <Input
              value={value.contact.sales_email}
              onChange={(e) =>
                setField("contact", { ...value.contact, sales_email: e.target.value })
              }
            />
          </Field>
          <Field label="HQ label">
            <Input
              value={value.contact.hq_label}
              onChange={(e) => setField("contact", { ...value.contact, hq_label: e.target.value })}
            />
          </Field>
          <Field label="HQ value">
            <Input
              value={value.contact.hq_value}
              onChange={(e) => setField("contact", { ...value.contact, hq_value: e.target.value })}
            />
          </Field>
        </TwoCol>
      </div>

      <Field label="Tagline (small line on right of bottom row)">
        <Textarea
          rows={2}
          value={value.tagline}
          onChange={(e) => setField("tagline", e.target.value)}
        />
      </Field>
      <Field label="Copyright line">
        <Input value={value.copyright} onChange={(e) => setField("copyright", e.target.value)} />
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Footer columns
        </p>
        <Repeater
          items={value.columns}
          onChange={(columns) => setValue({ ...value, columns })}
          newItem={() => ({ title: "", links: [] })}
          addLabel="Add column"
          max={6}
          renderItem={(col, updateCol) => (
            <>
              <Field label="Column title">
                <Input value={col.title} onChange={(e) => updateCol({ title: e.target.value })} />
              </Field>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Links
              </p>
              <Repeater
                items={col.links}
                onChange={(links) => updateCol({ links })}
                newItem={() => ({ label: "", href: "" })}
                addLabel="Add link"
                max={10}
                renderItem={(l, updateLink) => (
                  <TwoCol>
                    <Field label="Label">
                      <Input
                        value={l.label}
                        onChange={(e) => updateLink({ label: e.target.value })}
                      />
                    </Field>
                    <Field label="Link">
                      <Input
                        value={l.href}
                        onChange={(e) => updateLink({ href: e.target.value })}
                      />
                    </Field>
                  </TwoCol>
                )}
              />
            </>
          )}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Social links
        </p>
        <Repeater
          items={value.social}
          onChange={(social) => setValue({ ...value, social })}
          newItem={() => ({ platform: "facebook", href: "" })}
          addLabel="Add social link"
          max={10}
          renderItem={(item, update) => (
            <TwoCol>
              <Field label="Platform">
                <Select value={item.platform} onValueChange={(v) => update({ platform: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL">
                <Input value={item.href} onChange={(e) => update({ href: e.target.value })} />
              </Field>
            </TwoCol>
          )}
        />
      </div>
    </EditorShell>
  );
}

// =================== CONTACT ===================

type ContactDraft = {
  email: string;
  phone: string;
  address: string;
  hours: string;
};

const CONTACT_DEFAULT: ContactDraft = { email: "", phone: "", address: "", hours: "" };

export function ContactEditor({ row }: { row: SettingRow }) {
  const initial = { ...CONTACT_DEFAULT, ...(row.draft_value as Partial<ContactDraft>) };
  const { value, setField } = useDraft<ContactDraft>(initial, row.key);
  const { save, publish } = useSettingMutations(row.key);
  const dirty =
    !deepEqual(value, row.draft_value) || !deepEqual(row.draft_value, row.published_value);

  return (
    <EditorShell
      title="Contact information"
      description="Public email, phone, address and opening hours."
      dirty={dirty}
      saving={save.isPending}
      publishing={publish.isPending}
      onSave={() => save.mutate(value)}
      onPublish={() => publish.mutate()}
      publishedAt={row.published_at}
    >
      <TwoCol>
        <Field label="Email">
          <Input
            type="email"
            value={value.email}
            onChange={(e) => setField("email", e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input value={value.phone} onChange={(e) => setField("phone", e.target.value)} />
        </Field>
      </TwoCol>
      <Field label="Address">
        <Textarea
          rows={2}
          value={value.address}
          onChange={(e) => setField("address", e.target.value)}
        />
      </Field>
      <Field label="Hours">
        <Input value={value.hours} onChange={(e) => setField("hours", e.target.value)} />
      </Field>
    </EditorShell>
  );
}

// =================== Resolver ===================

export function SettingEditorByKey({ row }: { row: SettingRow }) {
  switch (row.key) {
    case "theme":
      return <ThemeEditor row={row} />;
    case "navbar":
      return <NavbarEditor row={row} />;
    case "footer":
      return <FooterEditor row={row} />;
    case "contact":
      return <ContactEditor row={row} />;
    default:
      return null;
  }
}
