import { AppFrame } from "@/components/app-frame";
import { MeasureApp } from "@/components/measure-app";

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
    <AppFrame current="/record">
      <main className="shell record-shell">
        <h1 className="sr-only">Record</h1>
        <MeasureApp />
      </main>
    </AppFrame>
  );
}
