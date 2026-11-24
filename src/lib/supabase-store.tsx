"use client";

/**
 * Supabase 版データストア。
 * 承認・通知・ステータス遷移の規則は DB 側（supabase/migrations）のトリガーで実行される。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABEL } from "./domain";
import type {
  ApprovalEvent,
  Category,
  Claim,
  EmailStatus,
  Level,
  Notification,
  NotificationEvent,
  Role,
  Status,
  User,
} from "./domain";
import { claimId, toDateInput } from "./format";
import type { Store } from "./store-types";
import { StoreContext } from "./store";
import { GOOGLE_WORKSPACE_DOMAIN, PHOTO_BUCKET, getSupabase, isCompanyEmail } from "./supabase/client";

type Branch = { id: number; name: string; is_site: boolean };

type ProfileRow = { id: string; name: string; role: Role; branch_id: number | null; email: string | null };

const NOT_COMPANY_ACCOUNT = "会社の Google アカウントでログインしてください";
const NO_PROFILE = "社員情報が登録されていません。管理者に連絡してください";

/** Google から戻ってきたときの URL のエラーを日本語にする */
function oauthErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  const desc = params.get("error_description") ?? params.get("error");
  if (!desc) return null;
  // DB のトリガーが会社以外のドメインを拒否すると「Database error saving new user」になる
  if (/database error/i.test(desc)) return NOT_COMPANY_ACCOUNT;
  if (/access_denied/i.test(desc)) return "ログインがキャンセルされました";
  return `ログインに失敗しました（${desc}）`;
}

type ClaimRow = {
  id: string;
  category: Category;
  level: Level;
  status: Status;
  title: string;
  content: string;
  site: string;
  responsible_person: string;
  customer: string;
  assignee_id: string | null;
  reporter_id: string;
  amount: number | null;
  occurred_on: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  claim_photos: { storage_path: string; created_at: string }[];
  claim_comments: { user_id: string; body: string; created_at: string }[];
  claim_approvals: {
    action: ApprovalEvent["action"];
    from_id: string;
    to_ids: string[];
    message: string;
    created_at: string;
  }[];
};

type NotificationRow = {
  id: number;
  claim_id: string;
  event: NotificationEvent;
  actor_id: string;
  created_at: string;
  notification_recipients: { user_id: string; read_at: string | null }[];
};

const CLAIM_SELECT = `*,
  claim_photos(storage_path, created_at),
  claim_comments(user_id, body, created_at),
  claim_approvals(action, from_id, to_ids, message, created_at)`;

const byTime = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);

function fail(error: { message: string } | null, what: string): asserts error is null {
  if (error) throw new Error(`${what}に失敗しました：${error.message}`);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export function SupabaseStoreProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [authReady, setAuthReady] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // ───────── 認証 ─────────
  useEffect(() => {
    const urlError = oauthErrorFromUrl();
    if (urlError) setAuthError(urlError);

    const accept = (session: { user: { id: string; email?: string } } | null) => {
      if (session && !isCompanyEmail(session.user.email)) {
        // 会社以外のアカウント：すぐにログアウト（DB 側でも拒否される）
        setAuthError(NOT_COMPANY_ACCOUNT);
        setAuthUserId(null);
        void supabase.auth.signOut();
        return;
      }
      setAuthUserId(session?.user.id ?? null);
    };
    supabase.auth.getSession().then(({ data }) => {
      accept(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => accept(session));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // ───────── 読み込み ─────────
  const loadAll = useCallback(async () => {
    const [b, p, c, n, sm, eo] = await Promise.all([
      supabase.from("branches").select("id, name, is_site").order("id"),
      supabase.from("profiles").select("id, name, role, branch_id, email").order("name"),
      supabase.from("claims").select(CLAIM_SELECT).order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("id, claim_id, event, actor_id, created_at, notification_recipients(user_id, read_at)")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("site_managers").select("site_id, user_id"),
      supabase
        .from("email_outbox")
        .select("notification_id, user_id, status, last_error")
        .order("id", { ascending: false })
        .limit(3000),
    ]);
    fail(b.error, "拠点の読み込み");
    fail(p.error, "社員の読み込み");
    fail(c.error, "クレームの読み込み");
    fail(n.error, "通知の読み込み");
    fail(sm.error, "担当現場の読み込み");
    fail(eo.error, "メール送信状況の読み込み");
    const emails = new Map<number, Record<string, { status: EmailStatus; error?: string }>>();
    for (const row of eo.data as {
      notification_id: number;
      user_id: string;
      status: EmailStatus;
      last_error: string | null;
    }[]) {
      const m = emails.get(row.notification_id) ?? {};
      m[row.user_id] = { status: row.status, error: row.last_error ?? undefined };
      emails.set(row.notification_id, m);
    }

    const branchRows = b.data as Branch[];
    const branchName = new Map(branchRows.map((x) => [x.id, x.name]));
    const managed = new Map<string, string[]>();
    for (const row of sm.data as { site_id: number; user_id: string }[]) {
      const name = branchName.get(row.site_id);
      if (name) managed.set(row.user_id, [...(managed.get(row.user_id) ?? []), name]);
    }
    const claimRows = c.data as ClaimRow[];

    // 写真は非公開バケットなので署名付き URL を発行
    const paths = claimRows.flatMap((r) => r.claim_photos.map((ph) => ph.storage_path));
    const signed = new Map<string, string>();
    if (paths.length > 0) {
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
      data?.forEach((d) => d.path && d.signedUrl && signed.set(d.path, d.signedUrl));
    }

    setBranches(branchRows);
    setUsers(
      (p.data as ProfileRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        branch: r.branch_id ? (branchName.get(r.branch_id) ?? "") : "",
        email: r.email ?? undefined,
        managedSites: managed.get(r.id) ?? [],
      })),
    );
    setClaims(
      claimRows.map((r) => ({
        id: r.id,
        category: r.category,
        level: r.level,
        status: r.status,
        title: r.title,
        content: r.content,
        site: r.site,
        responsiblePerson: r.responsible_person,
        customer: r.customer,
        assigneeId: r.assignee_id,
        reporterId: r.reporter_id,
        amount: r.amount,
        occurredOn: new Date(`${r.occurred_on}T00:00:00`).toISOString(),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at,
        photos: [...r.claim_photos]
          .sort(byTime)
          .map((ph) => signed.get(ph.storage_path))
          .filter((u): u is string => Boolean(u)),
        approvals: [...r.claim_approvals].sort(byTime).map((a) => ({
          action: a.action,
          fromId: a.from_id,
          toIds: a.action === "requested" ? a.to_ids : undefined,
          message: a.message,
          at: a.created_at,
        })),
        comments: [...r.claim_comments]
          .sort(byTime)
          .map((m) => ({ userId: m.user_id, text: m.body, at: m.created_at })),
      })),
    );
    setNotifications(
      (n.data as NotificationRow[]).map((r) => ({
        id: String(r.id),
        claimId: r.claim_id,
        event: r.event,
        actorId: r.actor_id,
        recipientIds: r.notification_recipients.map((x) => x.user_id),
        readByIds: r.notification_recipients.filter((x) => x.read_at).map((x) => x.user_id),
        createdAt: r.created_at,
        emails: emails.get(r.id) ?? {},
      })),
    );
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    if (!authUserId) {
      setLoaded(false);
      return;
    }
    loadAll().catch((e) => console.error(e));
  }, [authUserId, loadAll]);

  // ───────── リアルタイム更新（他の社員の操作を反映） ─────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!authUserId) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => loadAll().catch((e) => console.error(e)), 300);
    };
    const channel = supabase.channel("claims-changes");
    for (const table of [
      "site_managers",
      "claims",
      "claim_comments",
      "claim_approvals",
      "claim_photos",
      "notifications",
      "notification_recipients",
      "email_outbox",
    ]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    window.addEventListener("focus", schedule);
    return () => {
      window.removeEventListener("focus", schedule);
      supabase.removeChannel(channel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [authUserId, supabase, loadAll]);

  const me = users.find((u) => u.id === authUserId) ?? null;

  // ログインできたが社員情報がない（通常は自動作成されるので、削除された場合など）
  useEffect(() => {
    if (authUserId && loaded && !users.some((u) => u.id === authUserId)) {
      setAuthError(NO_PROFILE);
      void supabase.auth.signOut();
    }
  }, [authUserId, loaded, users, supabase]);
  const ready = authReady && (!authUserId || loaded);

  const userById = useCallback((id: string | null | undefined) => users.find((u) => u.id === id), [users]);

  const uploadPhotos = useCallback(
    async (id: string, photos: string[]) => {
      for (const dataUrl of photos) {
        const path = `${id}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, await dataUrlToBlob(dataUrl), { contentType: "image/jpeg" });
        fail(up.error, "写真のアップロード");
        const ins = await supabase.from("claim_photos").insert({ claim_id: id, storage_path: path });
        fail(ins.error, "写真の登録");
      }
    },
    [supabase],
  );

  const store = useMemo<Store>(() => {
    const addApproval = async (id: string, action: ApprovalEvent["action"], message: string) => {
      const { error } = await supabase
        .from("claim_approvals")
        .insert({ claim_id: id, action, message: message.trim() });
      fail(error, action === "requested" ? "承認依頼" : action === "approved" ? "承認" : "差し戻し");
      await loadAll();
    };

    return {
      mode: "supabase",
      ready,
      users,
      sites: branches.filter((b) => b.is_site).map((b) => b.name),
      me,
      claims,
      notifications,
      userById,
      login: () => {
        throw new Error("本番環境では Google アカウントでログインしてください");
      },
      authError,
      signInWithGoogle: async () => {
        setAuthError(null);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/login`,
            queryParams: {
              // 会社のドメインのアカウントを優先して表示（制限そのものは DB 側で行う）
              ...(GOOGLE_WORKSPACE_DOMAIN ? { hd: GOOGLE_WORKSPACE_DOMAIN } : {}),
              prompt: "select_account",
            },
          },
        });
        if (error) throw new Error(`Google ログインを開始できませんでした：${error.message}`);
      },
      logout: async () => {
        await supabase.auth.signOut();
      },
      refresh: loadAll,
      resetDemo: () => {},

      createClaim: async (input) => {
        const site = input.site.trim();
        if (!site) throw new Error("現場を入力してください");
        const id = claimId(new Date());
        const { error } = await supabase.from("claims").insert({
          id,
          category: input.category,
          title: input.title.trim() || `${CATEGORY_LABEL[input.category]} / ${input.site}`,
          content: input.content.trim(),
          site,
          responsible_person: input.responsiblePerson.trim(),
          customer: input.customer.trim(),
          assignee_id: input.assigneeId,
          amount: input.amount,
          occurred_on: input.occurredOn || toDateInput(new Date()),
        });
        fail(error, "クレームの登録");
        if (input.photos.length > 0) await uploadPhotos(id, input.photos);
        await loadAll();
        return { id } as Claim;
      },
      assignToMe: async (id) => {
        const { error } = await supabase.from("claims").update({ assignee_id: authUserId }).eq("id", id);
        fail(error, "担当者の設定");
        await loadAll();
      },
      requestApproval: (id, message) => addApproval(id, "requested", message),
      approve: (id, message) => addApproval(id, "approved", message),
      returnClaim: (id, message) => addApproval(id, "returned", message),
      addComment: async (id, text) => {
        const { error } = await supabase.from("claim_comments").insert({ claim_id: id, body: text.trim() });
        fail(error, "コメントの投稿");
        await loadAll();
      },
      addPhotos: async (id, photos) => {
        await uploadPhotos(id, photos);
        await loadAll();
      },
      markRead: async (nid) => {
        const { error } = await supabase
          .from("notification_recipients")
          .update({ read_at: new Date().toISOString() })
          .eq("notification_id", Number(nid))
          .eq("user_id", authUserId!);
        fail(error, "既読の更新");
        await loadAll();
      },
      markAllRead: async () => {
        const { error } = await supabase
          .from("notification_recipients")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", authUserId!)
          .is("read_at", null);
        fail(error, "既読の更新");
        await loadAll();
      },
    };
  }, [
    supabase,
    ready,
    users,
    branches,
    me,
    claims,
    notifications,
    userById,
    loadAll,
    uploadPhotos,
    authUserId,
    authError,
  ]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
