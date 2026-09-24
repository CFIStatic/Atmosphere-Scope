import { NextResponse } from "next/server";
import { createEmptyJob, runPipeline } from "@/analysis/pipeline";
import { getScenario, scenarioBundle } from "@/samples/scenarios";
import { saveJob } from "@/storage/job-store";

export async function POST(request: Request) {
  const body = await request.json();
  const scenario = getScenario(String(body.scenarioId ?? ""));
  if (!scenario) return NextResponse.json({ error: "Unknown sample." }, { status: 404 });
  const bundle = scenarioBundle(scenario);
  const created = createEmptyJob({
    address: scenario.address,
    city: scenario.city,
    region: scenario.region,
    postalCode: scenario.postalCode,
    customerName: scenario.customerName,
    phone: "",
    email: "",
    concern: scenario.concern,
  });
  const job = await saveJob(runPipeline(created, { ...bundle, usePriceBook: scenario.usePriceBook, failStage: scenario.failStage }));
  return NextResponse.json({ jobId: job.id });
}
