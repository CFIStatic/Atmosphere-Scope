import { NextResponse } from "next/server";
import { createEmptyJob, runPipeline } from "@/analysis/pipeline";
import { costLog, expectedWalkthroughMinuteUsd } from "@/analysis/video/cost";
import { getScenario, scenarioBundle } from "@/samples/scenarios";
import { saveJob } from "@/storage/job-store";
import { assignJobOrg } from "@/storage/job-org";
import { assertJobWriter } from "@/storage/visible-jobs";

export async function POST(request: Request) {
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const body = await request.json();
  const scenario = getScenario(String(body.scenarioId ?? ""));
  if (!scenario) return NextResponse.json({ error: "Unknown sample." }, { status: 404 });
  const bundle = scenarioBundle(scenario);
  const minute = expectedWalkthroughMinuteUsd();
  const analysisCost = bundle.detections?.length
    ? costLog({
      mediaId: bundle.media[0]?.id ?? null,
      durationSeconds: 45,
      stages: [{ stage: "inventory", model: "gpt-4o-mini", inputTokens: minute.distinctFrames * 4800, outputTokens: minute.distinctFrames * 1600, latencyMs: 0, estimatedUsd: minute.visionUsd }],
      note: "Planning estimate for about one minute at gpt-4o-mini list rates (12 distinct frames, full frame plus a 2×2 crop grid). Not an invoice and not a live call. The sample objects were scored from the fixture.",
    })
    : undefined;
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
  const job = await saveJob(await assignJobOrg(runPipeline(created, { ...bundle, usePriceBook: scenario.usePriceBook, failStage: scenario.failStage, analysisCost })));
  return NextResponse.json({ jobId: job.id });
}
