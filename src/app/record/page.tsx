import Link from "next/link";
import { MeasureApp } from "@/components/measure-app";

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
    <div className="phone-stage">
      <Link className="phone-jobs phone-jobs-outside" href="/jobs">Jobs</Link>
      <div className="phone-frame">
        <h1 className="sr-only">Record</h1>
        <MeasureApp />
      </div>
    </div>
  );
}
