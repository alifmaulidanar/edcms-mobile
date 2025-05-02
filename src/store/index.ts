import { createSlice, configureStore } from '@reduxjs/toolkit';

// User data type
interface UserData {
  id: number;
  user_id: string;
  email: string;
  username: string;
  role: string;
  phone: string;
}

// Supabase user type
// interface UserSupabase {
//   id: string;
//   aud: string;
//   role: string;
//   email: string;
//   email_confirmed_at?: string;
//   phone?: string;
//   last_sign_in_at?: string;
//   app_metadata: {
//     provider: string;
//     providers: string[];
//   };
//   user_metadata: {
//     email?: string;
//     email_verified?: boolean;
//     phone_verified?: boolean;
//     sub?: string;
//   };
//   identities?: Array<{
//     identity_id: string;
//     id: string;
//     user_id: string;
//     identity_data: object;
//     provider: string;
//     created_at: string;
//     updated_at: string;
//   }>;
//   created_at: string;
//   updated_at: string;
//   is_anonymous: boolean;
// }

// User slice
const userSlice = createSlice({
  name: 'user',
  initialState: null as UserData | null,
  reducers: {
    setUser: (state, action) => action.payload,
    clearUser: () => null,
  },
});

// Action creators
export const { setUser, clearUser } = userSlice.actions;

// Redux store configuration
const store = configureStore({
  reducer: { user: userSlice.reducer },
});

// Root state type
export type RootState = ReturnType<typeof store.getState>;

export default store;
