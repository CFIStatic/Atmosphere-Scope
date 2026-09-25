"use client";

import { useEffect, useState } from "react";

type ListedUser = { id: string; email: string; role: string | null; banned: boolean };

export function AdminUsers({ live }: { live: boolean }) {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [message, setMessage] = useState<string | null>(live ? null : "Dev preview. Invites are not sent until STORAGE=supabase and you are signed in as an admin.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    void fetch("/api/admin/users").then(async (response) => {
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The user list was not loaded.");
        return;
      }
      setUsers(body.users ?? []);
    });
  }, [live]);

  return (
    <div className="grid">
      {message && <p className="banner" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <form className="grid" onSubmit={async (event) => {
        event.preventDefault();
        if (!live) {
          setMessage("Dev preview. Invites are not sent until STORAGE=supabase and you are signed in as an admin.");
          return;
        }
        setError(null);
        setMessage(null);
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: form.get("email"), role: form.get("role") }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "The invite was not sent.");
          return;
        }
        setMessage("Invite sent. The role is stored in app metadata.");
        event.currentTarget.reset();
      }}>
        <p className="kicker">Invite</p>
        <label className="field">Email
          <input name="email" type="email" autoComplete="email" inputMode="email" required />
        </label>
        <label className="field">Role
          <select name="role" defaultValue="estimator">
            <option value="estimator">Estimator</option>
            <option value="customer">Customer</option>
          </select>
        </label>
        <button className="btn" type="submit">Send invite</button>
      </form>
      {live && users.length > 0 && (
        <div className="grid">
          <p className="kicker">People</p>
          {users.map((user) => (
            <article key={user.id} className="item-card">
              <strong>{user.email}</strong>
              <p className="meta">{user.role ?? "no role"}{user.banned ? " · deactivated" : ""}</p>
              <form className="row" onSubmit={async (event) => {
                event.preventDefault();
                const role = String(new FormData(event.currentTarget).get("role") ?? "");
                const response = await fetch("/api/admin/users", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: "role", userId: user.id, role }),
                });
                const body = await response.json();
                if (!response.ok) setError(body.error ?? "The role was not changed.");
                else setMessage("Role updated. The person may need to sign in again before it shows up.");
              }}>
                <label className="field">Role
                  <select name="role" defaultValue={user.role ?? "estimator"}>
                    <option value="admin">Admin</option>
                    <option value="estimator">Estimator</option>
                    <option value="customer">Customer</option>
                  </select>
                </label>
                <button className="btn secondary" type="submit">Save role</button>
              </form>
              <button className="btn secondary" type="button" onClick={async () => {
                const response = await fetch("/api/admin/users", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: user.banned ? "reactivate" : "deactivate", userId: user.id }),
                });
                const body = await response.json();
                if (!response.ok) setError(body.error ?? "The account was not updated.");
                else setUsers((current) => current.map((item) => item.id === user.id ? { ...item, banned: !user.banned } : item));
              }}>{user.banned ? "Reactivate" : "Deactivate"}</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
