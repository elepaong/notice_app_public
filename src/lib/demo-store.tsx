"use client";

/**
 * デモ用データストア（ブラウザの localStorage に保存）。
 * Supabase の環境変数が未設定のときに使われる。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_LEVEL,
  approversFor,
  canApprove,
  recipientsFor,
  type Claim,
  type Notification,
  type NotificationEvent,
  type User,
} from "./domain";
import { claimId } from "./format";
import { DEMO_USERS, SITES, createSeed } from "./seed";
import type { Store } from "./store-types";
import { StoreContext } from "./store";

const STORAGE_KEY = "claims-demo-v3";
const SESSION_KEY = "claims-demo-user";

type Data = { claims: Claim[]; notifications: Notification[] };

function load(): Data {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Data;
  } catch {
    /* 読めなければ初期データ */
  }
  return createSeed();
}

function save(data: Data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 容量超過などは無視（デモ） */
  }
}

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Data>({ claims: [], notifications: [] });
  const [meId, setMeId] = useState<string | null>(null);
  const users = DEMO_USERS;

  useEffect(() => {
    setData(load());
    try {
      setMeId(localStorage.getItem(SESSION_KEY));
    } catch {
      /* noop */
    }
    setReady(true);
  }, []);

  // 別タブでの変更を反映
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setData(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((fn: (d: Data) => Data) => {
    setData((prev) => {
      const next = fn(prev);
      save(next);
      return next;
    });
  }, []);

  const me = users.find((u) => u.id === meId) ?? null;

  const userById = useCallback(
    (id: string | null | undefined) => users.find((u) => u.id === id),
    [users],
  );

  /** クレームを更新し、必要なら通知を作る */
  const updateClaim = useCallback(
    (id: string, fn: (c: Claim) => Claim, event?: NotificationEvent) => {
      if (!me) return;
      commit((d) => {
        const now = new Date().toISOString();
        let updated: Claim | undefined;
        const claims = d.claims.map((c) => {
          if (c.id !== id) return c;
          updated = { ...fn(c), updatedAt: now };
          return updated;
        });
        if (!updated) return d;
        const notifications = event
          ? [makeNotification(event, updated, me.id, users, now), ...d.notifications]
          : d.notifications;
        return { claims, notifications };
      });
    },
    [commit, me, users],
  );

  const store = useMemo<Store>(
    () => ({
      mode: "demo",
      ready,
      users,
      sites: [...SITES],
      me,
      claims: data.claims,
      notifications: data.notifications,
      userById,
      login: (userId) => {
        localStorage.setItem(SESSION_KEY, userId);
        setMeId(userId);
      },
      signInWithGoogle: async () => {
        throw new Error("テスト環境では Google ログインは使えません");
      },
      authError: null,
      logout: async () => {
        localStorage.removeItem(SESSION_KEY);
        setMeId(null);
      },
      refresh: async () => setData(load()),
      resetDemo: (options) => {
        const seed: Data = options?.empty ? { claims: [], notifications: [] } : createSeed();
        save(seed);
        setData(seed);
      },
      createClaim: async (input) => {
        if (!me) throw new Error("ログインしていません");
        const now = new Date();
        const iso = now.toISOString();
        const claim: Claim = {
          id: claimId(now),
          category: input.category,
          level: CATEGORY_LEVEL[input.category],
          status: input.assigneeId ? "in_progress" : "received",
          title: input.title.trim() || `${CATEGORY_LABEL[input.category]} / ${input.site}`,
          content: input.content.trim(),
          site: input.site,
          responsiblePerson: input.responsiblePerson.trim(),
          customer: input.customer.trim(),
          assigneeId: input.assigneeId,
          reporterId: me.id,
          amount: input.amount,
          occurredOn: new Date(input.occurredOn).toISOString(),
          createdAt: iso,
          updatedAt: iso,
          completedAt: null,
          photos: input.photos,
          approvals: [],
          comments: [],
        };
        commit((d) => ({
          claims: [claim, ...d.claims],
          notifications: [makeNotification("created", claim, me.id, users, iso), ...d.notifications],
        }));
        return claim;
      },
      assignToMe: async (id) =>
        updateClaim(id, (c) => ({
          ...c,
          assigneeId: me!.id,
          status: c.status === "received" ? "in_progress" : c.status,
        })),
      requestApproval: async (id, message) =>
        updateClaim(
          id,
          (c) => ({
            ...c,
            status: "pending_approval",
            approvals: [
              ...c.approvals,
              {
                action: "requested",
                fromId: me!.id,
                toIds: approversFor(c, users).map((u) => u.id),
                message: message.trim(),
                at: new Date().toISOString(),
              },
            ],
          }),
          "approval_requested",
        ),
      approve: async (id, message) =>
        updateClaim(
          id,
          (c) => {
            if (!canApprove(me!, c, users)) return c;
            const at = new Date().toISOString();
            return {
              ...c,
              status: "done",
              completedAt: at,
              approvals: [...c.approvals, { action: "approved", fromId: me!.id, message: message.trim(), at }],
            };
          },
          "approved",
        ),
      returnClaim: async (id, message) =>
        updateClaim(
          id,
          (c) => {
            if (!canApprove(me!, c, users)) return c;
            return {
              ...c,
              status: "returned",
              approvals: [
                ...c.approvals,
                { action: "returned", fromId: me!.id, message: message.trim(), at: new Date().toISOString() },
              ],
            };
          },
          "returned",
        ),
      addComment: async (id, text) =>
        updateClaim(id, (c) => ({
          ...c,
          comments: [...c.comments, { userId: me!.id, text: text.trim(), at: new Date().toISOString() }],
        })),
      addPhotos: async (id, photos) => updateClaim(id, (c) => ({ ...c, photos: [...c.photos, ...photos] })),
      markRead: async (nid) =>
        commit((d) => ({
          ...d,
          notifications: d.notifications.map((n) =>
            n.id === nid && me && !n.readByIds.includes(me.id) ? { ...n, readByIds: [...n.readByIds, me.id] } : n,
          ),
        })),
      markAllRead: async () =>
        commit((d) => ({
          ...d,
          notifications: d.notifications.map((n) =>
            me && n.recipientIds.includes(me.id) && !n.readByIds.includes(me.id)
              ? { ...n, readByIds: [...n.readByIds, me.id] }
              : n,
          ),
        })),
    }),
    [ready, users, me, data, userById, commit, updateClaim],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function makeNotification(
  event: NotificationEvent,
  claim: Claim,
  actorId: string,
  users: User[],
  at: string,
): Notification {
  return {
    id: `n-${claim.id}-${event}-${Date.now()}`,
    claimId: claim.id,
    event,
    actorId,
    recipientIds: recipientsFor(event, claim, actorId, users),
    readByIds: [],
    createdAt: at,
  };
}
