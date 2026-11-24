import type { Category, Claim, Notification, User } from "./domain";

export type NewClaimInput = {
  category: Category;
  occurredOn: string;
  site: string;
  responsiblePerson: string;
  customer: string;
  assigneeId: string | null;
  amount: number | null;
  content: string;
  title: string;
  /** data URL（縮小済み） */
  photos: string[];
};

/**
 * 画面が使うデータ操作。デモ（localStorage）と Supabase の2実装がある。
 */
export type Store = {
  mode: "demo" | "supabase";
  ready: boolean;
  users: User[];
  /** 現場として選べる拠点名 */
  sites: string[];
  me: User | null;
  claims: Claim[];
  notifications: Notification[];
  userById: (id: string | null | undefined) => User | undefined;

  /** テスト環境：テスト用アカウントを選んでログイン */
  login: (userId: string) => void;
  /** 本番：会社の Google アカウントでログイン（Google の画面へ移動する） */
  signInWithGoogle: () => Promise<void>;
  /** ログインできなかった理由（会社以外のアカウント、社員情報なし など） */
  authError: string | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** デモ：データを初期化 */
  resetDemo: () => void;

  createClaim: (input: NewClaimInput) => Promise<Claim>;
  assignToMe: (claimId: string) => Promise<void>;
  requestApproval: (claimId: string, message: string) => Promise<void>;
  approve: (claimId: string, message: string) => Promise<void>;
  returnClaim: (claimId: string, message: string) => Promise<void>;
  addComment: (claimId: string, text: string) => Promise<void>;
  addPhotos: (claimId: string, photos: string[]) => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};
