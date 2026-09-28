# guardian-scan: support ?q= deep links

Apply on `milesdev888/guardian-scan` `app/page.tsx` (this agent lacked push access).

`?address=` already auto-runs. This patch also accepts `?q=` (homepage / share links)
and ignores invalid/empty values so the empty scanner still loads cleanly.

```tsx
import { redirect } from "next/navigation";
import { ScanForm } from "@/components/scanner/scan-form";
import { detectFamily } from "@/lib/chains/detect";

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  // Support both ?address= and deep-link ?q= (homepage / share links).
  // Invalid or empty q loads the normal empty scanner — no error flash.
  const raw =
    readParam(params.address)?.trim() ||
    readParam(params.q)?.trim() ||
    "";

  if (raw) {
    const detected = detectFamily(raw);
    if (detected.family) {
      const chain = readParam(params.chain);
      const suffix = chain
        ? `&chain=${encodeURIComponent(chain)}`
        : "";
      redirect(
        `/app?address=${encodeURIComponent(detected.address)}${suffix}`,
      );
    }
  }

  return (
    <div className="px-4 py-10 sm:py-16">
      <ScanForm address="" result={null} />
    </div>
  );
}
```

After merge+deploy, cyre.dev can switch form/`$C7` links back to `?q=` if desired.
`?address=` remains the supported auto-run param either way.
