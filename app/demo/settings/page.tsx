// The actual content lives in components/settings/SettingsPageBody.tsx --
// see that file's own note on why a page.tsx cannot also be the reusable
// piece (next build's typed-routes check rejects both a non-standard named
// export and a custom prop on the route's own default export).
"use client";

import { SettingsPageBody } from "@/components/settings/SettingsPageBody";

export default function SettingsPage() {
  return <SettingsPageBody />;
}
