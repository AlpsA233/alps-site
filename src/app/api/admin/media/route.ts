import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  claimMediaUploadAttempt,
  createMediaUploadHandler,
  isMediaConfigured,
  uploadMedia,
} from "@/lib/media";

export const runtime = "nodejs";

const handleUpload = createMediaUploadHandler({
  isAdmin,
  claimAttempt: async () => claimMediaUploadAttempt(await db()),
  isConfigured: isMediaConfigured,
  upload: uploadMedia,
});

export async function POST(request: Request) {
  return handleUpload(request);
}
