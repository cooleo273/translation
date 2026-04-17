export type FileRow = {
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  status: string;
  original_url: string | null;
  processed_url: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  is_favorite: boolean;
  created_at: string;
};

export type TranslationRow = {
  id: string;
  file_id: string;
  detected_language: string | null;
  translated_text: string | null;
  original_text: string | null;
  target_language: string;
  mode: string;
  custom_prompt: string | null;
  document_type: string | null;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_name: string;
  start_date: string;
  end_date: string | null;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiKeyRow = {
  id: string;
  user_id: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};
