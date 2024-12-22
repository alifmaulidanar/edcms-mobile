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
