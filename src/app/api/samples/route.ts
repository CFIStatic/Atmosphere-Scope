import { NextResponse } from "next/server";
import { createEmptyJob, runPipeline } from "@/analysis/pipeline";
import { triageVisionModel, inventoryVisionModel } from "@/analysis/config";
import { dedupeDetections } from "@/analysis/objects/dedupe";
import { assignAssessedBy, escalationSummary, planEscalation } from "@/analysis/objects/escalate";
import { narrationCues } from "@/analysis/objects/narration";
import { costLog, expectedModeMinuteUsd, PLANNING_CROP_INPUT, PLANNING_CROP_OUTPUT, PLANNING_ESCALATED_CROPS, PLANNING_FRAMES, PLANNING_INPUT_PER_FRAME, PLANNING_OUTPUT_PER_FRAME, tokensToUsd, TRIAGE_MODEL, INVENTORY_MODEL } from "@/analysis/video/cost";
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
  const cascade = expectedModeMinuteUsd("cascade");
  let escalation = null;
  if (bundle.detections?.length) {
    const clusters = dedupeDetections(bundle.detections);
    const plan = planEscalation({
      clusters,
      cues: narrationCues(bundle.transcripts),
      mode: "cascade",
      threshold: 0.75,
      auditRate: 0,
    });
    const triage = triageVisionModel();
    const strong = inventoryVisionModel();
    for (const decision of plan.decisions) {
      const cluster = clusters.find((item) => item.id === decision.id);
      if (cluster) assignAssessedBy(cluster, decision.escalate ? strong : triage, decision.escalate);
    }
    escalation = plan.counts;
  }
  const triageTokens = { input: PLANNING_FRAMES * PLANNING_INPUT_PER_FRAME, output: PLANNING_FRAMES * PLANNING_OUTPUT_PER_FRAME };
  const cropTokens = { input: PLANNING_ESCALATED_CROPS * PLANNING_CROP_INPUT, output: PLANNING_ESCALATED_CROPS * PLANNING_CROP_OUTPUT };
  const analysisCost = bundle.detections?.length
    ? costLog({
      mediaId: bundle.media[0]?.id ?? null,
      durationSeconds: 45,
      escalation,
      stages: [
        { stage: "triage", model: TRIAGE_MODEL, inputTokens: triageTokens.input, outputTokens: triageTokens.output, latencyMs: 0, estimatedUsd: tokensToUsd(triageTokens.input, triageTokens.output, TRIAGE_MODEL) },
        { stage: "escalation", model: INVENTORY_MODEL, inputTokens: cropTokens.input, outputTokens: cropTokens.output, latencyMs: 0, estimatedUsd: tokensToUsd(cropTokens.input, cropTokens.output, INVENTORY_MODEL) },
      ],
      note: `Planning estimate for cascade mode, about $${cascade.totalUsd.toFixed(2)} per walkthrough minute (${PLANNING_FRAMES} distinct frames on ${TRIAGE_MODEL}, plus ${PLANNING_ESCALATED_CROPS} ${INVENTORY_MODEL} object crops). Not an invoice and not a live call. The sample objects were scored from the fixture. ${escalation ? escalationSummary(escalation) : ""}`.trim(),
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
