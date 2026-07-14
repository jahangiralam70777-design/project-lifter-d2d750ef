// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "blog-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin role required");
}

const uploadInput = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(100),
  // base64-encoded payload (no data: prefix)
  base64: z.string().min(1).max(16_000_000),
});

export const adminUploadBlogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => uploadInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);

    if (!ALLOWED.includes(data.contentType.toLowerCase())) {
      throw new Error("Unsupported file type. Use JPG, PNG, WEBP, or GIF.");
    }

    const buf = Buffer.from(data.base64, "base64");
    if (buf.byteLength === 0) throw new Error("Empty file");
    if (buf.byteLength > MAX_BYTES) throw new Error("File too large (max 8MB)");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure bucket exists & is public
    try {
      const { data: b } = await supabaseAdmin.storage.getBucket(BUCKET);
      if (!b) {
        await supabaseAdmin.storage.createBucket(BUCKET, {
          public: true,
          fileSizeLimit: MAX_BYTES,
          allowedMimeTypes: ALLOWED,
        });
      } else if (!b.public) {
        await supabaseAdmin.storage.updateBucket(BUCKET, { public: true });
      }
    } catch {
      await supabaseAdmin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ALLOWED,
      }).catch(() => {});
    }

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
    const rnd =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const path = `${new Date().getFullYear()}/${context.userId}/${Date.now()}-${rnd}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, {
        contentType: data.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
  });