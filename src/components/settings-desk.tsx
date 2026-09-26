"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountForm } from "@/components/account-form";
import { ThemeToggle } from "@/components/theme-toggle";
import type { EstimateDefaults, LaborRate, Member, NotificationPref, Org, Profile } from "@/domain/workspace";

const SECTIONS = [
  ["profile", "Profile"],
  ["company", "Company"],
  ["team", "Team"],
  ["appearance", "Appearance"],
  ["estimate", "Estimate defaults"],
  ["calibration", "Calibration"],
  ["notifications", "Notifications"],
  ["usage", "Usage"],
  ["billing", "Billing"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function isSection(value: string | null): value is SectionId {
  return SECTIONS.some(([id]) => id === value);
}

type Desk = {
  profile: Profile;
  org: Org | null;
  defaults: EstimateDefaults | null;
  notifications: NotificationPref;
  role: string;
};

export function SettingsDesk({ notice }: { notice: string | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("section");
  const active: SectionId = isSection(requested) ? requested : "profile";
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/account").then(async (response) => {
      if (!response.ok) return;
      setDesk(await response.json());
    });
  }, []);

  function select(section: SectionId) {
    const next = section === "profile" ? "/settings" : `/settings?section=${section}`;
    router.push(next);
  }

  return (
    <div className="settings">
      <header className="topbar">
        <h1 className="page-title">Settings</h1>
      </header>
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" aria-current={active === id ? "page" : undefined} onClick={() => select(id)}>
            {label}
          </button>
        ))}
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
      {active === "profile" && <ProfileSection desk={desk} notice={notice} onError={setError} onDesk={setDesk} />}
      {active === "company" && <CompanySection desk={desk} onError={setError} onDesk={setDesk} />}
      {active === "team" && <TeamSection role={desk?.role ?? ""} onError={setError} />}
      {active === "appearance" && (
        <section className="panel grid">
          <h2>Appearance</h2>
          <p className="meta">Light and dark. The first visit follows this device. After that, the choice is saved in this browser.</p>
          <ThemeToggle labeled />
        </section>
      )}
      {active === "estimate" && <EstimateSection desk={desk} onError={setError} onDesk={setDesk} />}
      {active === "calibration" && (
        <section className="panel account-sheet">
          <h2>Calibration sheet</h2>
          <p className="meta">Place the sheet flat on the floor, in view of the camera, then record.</p>
          <p><a href="/api/calibration-target">Download sheet PDF</a></p>
        </section>
      )}
      {active === "notifications" && <NotificationsSection desk={desk} onError={setError} onDesk={setDesk} />}
      {active === "usage" && <UsageSection />}
      {active === "billing" && <BillingSection />}
    </div>
  );
}

function ProfileSection({ desk, notice, onError, onDesk }: { desk: Desk | null; notice: string | null; onError: (value: string | null) => void; onDesk: (desk: Desk) => void }) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (desk) setName(desk.profile.fullName || "");
  }, [desk]);
  return (
    <div className="grid">
      <section className="panel grid">
        <h2>Profile</h2>
        <UploadControl
          label="Upload photo"
          preview={desk?.profile.avatarUrl ? <img className="avatar-preview" src={desk.profile.avatarUrl} alt="" /> : <span className="who-avatar" aria-hidden="true">{(name || desk?.profile.email || "—").slice(0, 1).toUpperCase()}</span>}
          onFile={async (dataUrl) => {
            const response = await fetch("/api/account/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl }) });
            const body = await response.json();
            if (!response.ok) {
              onError(body.error ?? "The photo was not saved.");
              return;
            }
            if (desk) onDesk({ ...desk, profile: body.profile });
            onError(null);
            setSaved("Photo saved.");
          }}
          onReject={() => onError("Use an image under 120 KB.")}
        />
        <form className="grid" onSubmit={async (event) => {
          event.preventDefault();
          onError(null);
          const response = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: name }) });
          const body = await response.json();
          if (!response.ok) {
            onError(body.error ?? "The name was not saved.");
            return;
          }
          if (desk) onDesk({ ...desk, profile: body.profile });
          setSaved("Name saved.");
        }}>
          <label className="field">Name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
          </label>
          <label className="field">Email
            <input value={desk?.profile.email ?? ""} readOnly aria-readonly="true" />
          </label>
          {saved && <p className="meta" role="status">{saved}</p>}
          <button className="btn" type="submit">Save profile</button>
        </form>
      </section>
      <AccountForm notice={notice} />
    </div>
  );
}

function CompanySection({ desk, onError, onDesk }: { desk: Desk | null; onError: (value: string | null) => void; onDesk: (desk: Desk) => void }) {
  const [name, setName] = useState(desk?.org?.name ?? "");
  const [address, setAddress] = useState(desk?.org?.address ?? "");
  const [license, setLicense] = useState(desk?.org?.licenseNumbers ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    setName(desk?.org?.name ?? "");
    setAddress(desk?.org?.address ?? "");
    setLicense(desk?.org?.licenseNumbers ?? "");
  }, [desk]);
  return (
    <form className="panel grid" onSubmit={async (event) => {
      event.preventDefault();
      onError(null);
      const response = await fetch("/api/account/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, address, licenseNumbers: license, logoUrl: desk?.org?.logoUrl ?? "" }),
      });
      const body = await response.json();
      if (!response.ok) {
        onError(body.error ?? "The company was not saved.");
        return;
      }
      if (desk) onDesk({ ...desk, org: body.org });
      setSaved("Company saved. The name and license print on estimate PDFs when they are filled in.");
    }}>
      <h2>Company</h2>
      <p className="meta">Name, address, and license numbers. Empty fields stay empty.</p>
      <UploadControl
        label="Upload logo"
        preview={desk?.org?.logoUrl ? <img className="logo-preview" src={desk.org.logoUrl} alt="" /> : <span className="logo-preview" aria-hidden="true" />}
        onFile={async (dataUrl) => {
          const response = await fetch("/api/account/company", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: name || desk?.org?.name || "", address, licenseNumbers: license, logoUrl: dataUrl }),
          });
          const body = await response.json();
          if (!response.ok) {
            onError(body.error ?? "The logo was not saved.");
            return;
          }
          if (desk) onDesk({ ...desk, org: body.org });
          onError(null);
          setSaved("Logo saved.");
        }}
        onReject={() => onError("Use an image under 120 KB.")}
      />
      <label className="field">Company name
        <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
      </label>
      <label className="field">Address
        <input value={address} onChange={(event) => setAddress(event.target.value)} />
      </label>
      <label className="field">License numbers
        <input value={license} onChange={(event) => setLicense(event.target.value)} />
      </label>
      {saved && <p className="meta" role="status">{saved}</p>}
      <button className="btn" type="submit">Save company</button>
    </form>
  );
}

function TeamSection({ role, onError }: { role: string; onError: (value: string | null) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"estimator" | "customer">("estimator");
  const [note, setNote] = useState<string | null>(null);
  async function load() {
    const response = await fetch("/api/account/team");
    if (!response.ok) return;
    const body = await response.json();
    setMembers(body.members ?? []);
  }
  useEffect(() => { void load(); }, []);
  return (
    <section className="panel grid">
      <h2>Team</h2>
      <p className="meta">Invite an estimator or a customer. Roles stay in the account record. An admin cannot be chosen here.</p>
      {role === "admin" && <form className="grid" onSubmit={async (event) => {
          event.preventDefault();
          onError(null);
          const response = await fetch("/api/account/team", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, role: memberRole }),
          });
          const body = await response.json();
          if (!response.ok) {
            onError(body.error ?? "The invite was not sent.");
            return;
          }
          setEmail("");
          setNote(body.mailed ? "Invite email sent." : "Invite saved. Email sends when Resend is configured, otherwise Supabase sends it on a hosted server.");
          await load();
        }}>
          <label className="field">Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">Role
            <select value={memberRole} onChange={(event) => setMemberRole(event.target.value === "customer" ? "customer" : "estimator")}>
              <option value="estimator">Estimator</option>
              <option value="customer">Customer</option>
            </select>
          </label>
          <button className="btn" type="submit">Invite</button>
        </form>}
      <p className="meta">Only an admin can send the invite. Estimators and customers can see the team.</p>
      {note && <p className="meta" role="status">{note}</p>}
      <ul className="list">
        {members.length === 0 && <li className="meta">No teammates yet.</li>}
        {members.map((member) => (
          <li key={`${member.email}-${member.revokedAt ?? "active"}`} className="row">
            <span>{member.email} · {member.role}{member.revokedAt ? " · revoked" : ""}</span>
            {role === "admin" && !member.revokedAt && (
              <button className="btn secondary" type="button" onClick={async () => {
                const response = await fetch("/api/account/team", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: member.email }) });
                const body = await response.json();
                if (!response.ok) onError(body.error ?? "The member was not revoked.");
                else await load();
              }}>Revoke</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EstimateSection({ desk, onError, onDesk }: { desk: Desk | null; onError: (value: string | null) => void; onDesk: (desk: Desk) => void }) {
  const initial = desk?.defaults;
  const [taxRate, setTaxRate] = useState(initial?.taxRate ?? "");
  const [overheadPct, setOverheadPct] = useState(initial?.overheadPct ?? "");
  const [profitPct, setProfitPct] = useState(initial?.profitPct ?? "");
  const [region, setRegion] = useState(initial?.priceListRegion ?? "");
  const [labor, setLabor] = useState<LaborRate[]>(initial?.laborRates ?? []);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    setTaxRate(desk?.defaults?.taxRate ?? "");
    setOverheadPct(desk?.defaults?.overheadPct ?? "");
    setProfitPct(desk?.defaults?.profitPct ?? "");
    setRegion(desk?.defaults?.priceListRegion ?? "");
    setLabor(desk?.defaults?.laborRates ?? []);
  }, [desk]);
  return (
    <form className="panel grid" onSubmit={async (event) => {
      event.preventDefault();
      onError(null);
      const response = await fetch("/api/account/defaults", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxRate, overheadPct, profitPct, priceListRegion: region, laborRates: labor }),
      });
      const body = await response.json();
      if (!response.ok) {
        onError(body.error ?? "The defaults were not saved.");
        return;
      }
      if (desk) onDesk({ ...desk, defaults: body.defaults });
      setSaved("Defaults saved. Empty fields were left empty.");
    }}>
      <h2>Estimate defaults</h2>
      <p className="meta">Leave a field blank when you do not have a number. Nothing here is filled in for you.</p>
      <label className="field">Tax rate
        <input value={taxRate} onChange={(event) => setTaxRate(event.target.value)} inputMode="decimal" placeholder="" />
      </label>
      <label className="field">Overhead percent
        <input value={overheadPct} onChange={(event) => setOverheadPct(event.target.value)} inputMode="decimal" />
      </label>
      <label className="field">Profit percent
        <input value={profitPct} onChange={(event) => setProfitPct(event.target.value)} inputMode="decimal" />
      </label>
      <label className="field">Price list region
        <input value={region} onChange={(event) => setRegion(event.target.value)} />
      </label>
      <div className="grid">
        <p className="kicker">Labor rates</p>
        {labor.map((row, index) => (
          <div className="row" key={row.id}>
            <label className="field">Name
              <input value={row.name} aria-label={`Labor name ${index + 1}`} onChange={(event) => setLabor(labor.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
            </label>
            <label className="field">Rate
              <input value={row.rate} aria-label={`Labor rate ${index + 1}`} inputMode="decimal" onChange={(event) => setLabor(labor.map((item) => item.id === row.id ? { ...item, rate: event.target.value } : item))} />
            </label>
          </div>
        ))}
        <button className="btn secondary" type="button" onClick={() => setLabor([...labor, { id: crypto.randomUUID(), name: "", rate: "" }])}>Add a labor rate</button>
      </div>
      {saved && <p className="meta" role="status">{saved}</p>}
      <button className="btn" type="submit">Save defaults</button>
    </form>
  );
}

function NotificationsSection({ desk, onError, onDesk }: { desk: Desk | null; onError: (value: string | null) => void; onDesk: (desk: Desk) => void }) {
  const [jobShared, setJobShared] = useState(desk?.notifications.jobShared ?? true);
  const [invites, setInvites] = useState(desk?.notifications.invites ?? true);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!desk) return;
    setJobShared(desk.notifications.jobShared);
    setInvites(desk.notifications.invites);
  }, [desk]);
  return (
    <form className="panel grid" onSubmit={async (event) => {
      event.preventDefault();
      const response = await fetch("/api/account/notifications", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobShared, invites }),
      });
      const body = await response.json();
      if (!response.ok) {
        onError(body.error ?? "Notifications were not saved.");
        return;
      }
      if (desk) onDesk({ ...desk, notifications: body.notifications });
      setSaved("Notifications saved.");
    }}>
      <h2>Notifications</h2>
      <label className="row"><input type="checkbox" checked={jobShared} onChange={(event) => setJobShared(event.target.checked)} /> Email when a job is shared with me</label>
      <label className="row"><input type="checkbox" checked={invites} onChange={(event) => setInvites(event.target.checked)} /> Email when I am invited</label>
      {saved && <p className="meta" role="status">{saved}</p>}
      <button className="btn" type="submit">Save notifications</button>
    </form>
  );
}

function UsageSection() {
  const [range, setRange] = useState<"30d" | "90d">("30d");
  const [report, setReport] = useState<{ inputTokens: number; outputTokens: number; costUsd: number | null; days: { day: string; tokens: number; costUsd: number | null }[]; rows: { id: string; model: string; jobId: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; createdAt: string }[] } | null>(null);
  useEffect(() => {
    void fetch(`/api/account/usage?range=${range}`).then(async (response) => {
      if (response.ok) setReport(await response.json());
    });
  }, [range]);
  const peak = useMemo(() => Math.max(1, ...(report?.days.map((day) => day.tokens) ?? [1])), [report]);
  return (
    <section className="panel grid">
      <div className="row">
        <h2>Usage</h2>
        <div className="row" role="tablist" aria-label="Usage window">
          <button type="button" role="tab" aria-selected={range === "30d"} onClick={() => setRange("30d")}>Last 30 days</button>
          <button type="button" role="tab" aria-selected={range === "90d"} onClick={() => setRange("90d")}>Last 90 days</button>
        </div>
      </div>
      <p className="meta">OpenAI calls for this workspace. Cost is the published list rate for a known model. An unknown model stays blank.</p>
      {!report && <p className="meta">Loading usage…</p>}
      {report && report.days.length === 0 && <p className="meta">No token usage in this window yet.</p>}
      {report && report.days.length > 0 && (
        <div className="usage-chart" role="img" aria-label="Token usage by day">
          {report.days.map((day) => (
            <div key={day.day} className="usage-bar" title={`${day.day}: ${day.tokens} tokens`}>
              <span style={{ height: `${Math.max(4, (day.tokens / peak) * 120)}px` }} />
              <small>{day.day.slice(5)}</small>
            </div>
          ))}
        </div>
      )}
      {report && (
        <p className="meta">
          Input {report.inputTokens} · Output {report.outputTokens} · Cost {report.costUsd == null ? "—" : `$${report.costUsd.toFixed(4)}`}
        </p>
      )}
      {report && report.rows.length > 0 && (
        <table className="data">
          <thead><tr><th>When</th><th>Model</th><th>Job</th><th>Tokens</th><th>Cost</th></tr></thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td>{row.model}</td>
                <td>{row.jobId ? <Link href={`/jobs/${row.jobId}`}>{row.jobId}</Link> : "—"}</td>
                <td>{(row.inputTokens ?? 0) + (row.outputTokens ?? 0)}</td>
                <td>{row.costUsd == null ? "—" : `$${row.costUsd.toFixed(4)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BillingSection() {
  const [billing, setBilling] = useState<{ plan: null; status: string; invoices: unknown[]; note: string } | null>(null);
  useEffect(() => {
    void fetch("/api/account/billing").then(async (response) => {
      if (response.ok) setBilling(await response.json());
    });
  }, []);
  return (
    <section className="panel grid">
      <h2>Billing</h2>
      <p className="kicker">Plan</p>
      <p>{billing?.plan ?? "No plan"}</p>
      <p className="meta">{billing?.note ?? "No plan is attached. Billing is not connected."}</p>
      <h3>Invoices</h3>
      <p className="meta">No invoices.</p>
    </section>
  );
}

function UploadControl({
  label,
  preview,
  onFile,
  onReject,
}: {
  label: string;
  preview: ReactNode;
  onFile: (dataUrl: string) => Promise<void>;
  onReject: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="upload-row">
      {preview}
      <button className="btn secondary" type="button" onClick={() => inputRef.current?.click()}>{label}</button>
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const dataUrl = await readImage(file);
          if (!dataUrl) {
            onReject();
            return;
          }
          await onFile(dataUrl);
        }}
      />
    </div>
  );
}

function readImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > 120_000) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
