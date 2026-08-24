"use client";

import dynamic from "next/dynamic";

const POWorkspace = dynamic(() => import("../components/POWorkspace"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#4A567A", fontFamily: "Inter, system-ui, sans-serif" }}>
      Loading PO Register...
    </div>
  ),
});

export default function Page() {
  return <POWorkspace />;
}
