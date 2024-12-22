// User type definition
export interface User {
  id: string;
  user_id: string;
  email: string;
  username: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  password: string;
}

// Profile type definition
export interface Profile {
  id: string;
  user_id: string;
  avatar?: string;
  email: string;
  username: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}